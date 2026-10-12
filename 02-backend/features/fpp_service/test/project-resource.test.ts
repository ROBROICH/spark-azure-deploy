import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { projectErrors } from "@spark-workflow/core/projects/data";
import { Projects, type ProjectsResourceService } from "@spark-workflow/core/projects/resource";
import { createPostgresRuntime, PostgreSQL } from "@spark-workflow/postgres-runtime";
import { composeFeatures, defineFeature, provide } from "@spark-workflow/resource";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";
import { Result } from "better-result";
import { better } from "better-drizzle";

import { fppSchema } from "../src/db/schema.ts";
import { FppConfiguration, parseFppConfiguration } from "../src/env.ts";
import { confirmFppDownload, getFppFile } from "../src/files.ts";
import { FppDownloads, FppFiles, type FppDownloadsService } from "../src/resource.ts";
import { buildImportRequest } from "./support/mutation-scenarios.ts";

Object.assign(process.env, {
  AUTH_MODE: "disabled",
  DEFAULT_PROJECT_TYPE_ID: "00000000-0000-4000-8000-000000000010",
  FPP_ALLOWED_DOMAINS: "files.fpp-test.example",
  FPP_BLOCK_PRIVATE_IPS: "true",
  SYSTEM_USER_ID: "00000000-0000-4000-8000-000000000011",
});

const [{ createFeatureHttp }, { feature }, { createProjectRoutes }] = await Promise.all([
  import("@spark-workflow/http-host"),
  import("../src/index.ts"),
  import("../src/routes/projects.ts"),
]);

type ProjectCreator = Pick<ProjectsResourceService, "createProject">;
type ImportFiles = Parameters<typeof buildImportRequest>[3];
type ImportRequest = ReturnType<typeof buildImportRequest>;

const databaseUrl = process.env.FPP_MUTATION_DATABASE_URL;

describe.skipIf(databaseUrl === undefined)("FPP import and download binding", () => {
  const postgres = createPostgresRuntime({ url: databaseUrl!, schema: fppSchema });
  const scope = postgres.scope(fppSchema);
  const requestIds: string[] = [];

  afterEach(async () => {
    await postgres.query(async (database) => {
      const models = better(database, { schema: fppSchema });
      await models.fppFiles.deleteMany({ where: { requestId: { in: requestIds } } });
      await models.fppRequests.deleteMany({ where: { requestId: { in: requestIds } } });
    });
    requestIds.length = 0;
  });
  afterAll(() => postgres.close());

  const importRequest = (files: ImportFiles = []) => {
    const requestId = crypto.randomUUID();
    requestIds.push(requestId);
    return buildImportRequest(requestId, `FPP-${requestId}`, "multi-state", files);
  };
  const stored = (requestId: string) =>
    postgres.query((database) =>
      better(database, { schema: fppSchema }).fppRequests.findUnique({
        where: { requestId },
        include: { files: true },
      }),
    );
  const createdProject = (projectId: ReturnType<typeof crypto.randomUUID>): ProjectCreator => ({
    async createProject(_input, withinTransaction) {
      return Result.ok(
        await postgres.transact(() => withinTransaction({ id: projectId, projectVersion: 1 })),
      );
    },
  });
  const plan = {
    fileType: "PLANUNTERLAGEN",
    fileUrl: "https://files.fpp-test.example/plan.zip",
    fileName: "plan.zip",
  } satisfies NonNullable<ImportFiles>[number];
  const unexpected = () => {
    throw new Error("Unexpected call");
  };
  const noDownloads: FppDownloadsService = { start: unexpected };

  const post = async (
    projects: ProjectCreator,
    downloads: FppDownloadsService,
    body: ImportRequest,
  ) => {
    const resources = makeEffectResourceRuntime(
      composeFeatures([
        defineFeature({
          id: "fpp-project-route-test",
          needs: {},
          providers: [
            provide({
              resource: Projects,
              needs: {},
              make: (): ProjectsResourceService => ({
                ...projects,
                list: unexpected,
                get: unexpected,
                create: unexpected,
                update: unexpected,
                delete: unexpected,
                resolveLatestVersion: unexpected,
                projectTypeId: unexpected,
                validateWriteVersion: unexpected,
                validateVersionLock: unexpected,
                getTopic: unexpected,
                listTopicNorms: unexpected,
                batchNodes: unexpected,
                executeNodeMutation: unexpected,
                updateStatus: unexpected,
                exportMetadata: unexpected,
                listTopics: unexpected,
              }),
            }),
            provide({ resource: FppDownloads, needs: {}, make: () => downloads }),
            provide({
              resource: FppFiles,
              needs: {},
              make: () => ({ getFile: unexpected, confirmDownload: unexpected }),
            }),
            provide({
              resource: FppConfiguration,
              needs: {},
              make: () => parseFppConfiguration(process.env),
            }),
            provide({ resource: PostgreSQL, needs: {}, make: () => postgres }),
          ] as const,
          tables: {},
        }),
      ] as const),
    );
    const app = createProjectRoutes(createFeatureHttp(resources).for(feature));
    try {
      return await app.handle(
        new Request("http://localhost/external/fpp/projects", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    } finally {
      await resources.close();
    }
  };

  test("rejects malformed XML before persisting the import", async () => {
    const body = { ...importRequest(), xml: "<broken" };

    const response = await post({ createProject: unexpected }, noDownloads, body);

    expect(response.status).toBe(500);
    expect(await stored(body.requestId)).toBeNull();
  });

  test("maps an import to the project creator and stores the files at the new version", async () => {
    const projectId = crypto.randomUUID();
    const body = importRequest([plan]);
    let received: Parameters<ProjectCreator["createProject"]>[0] | undefined;
    const downloads: FppDownloadsService = { start: async () => Result.ok({ parentJobId: "job" }) };

    const response = await post(
      {
        async createProject(input, withinTransaction) {
          received = input;
          return createdProject(projectId).createProject(input, withinTransaction);
        },
      },
      downloads,
      body,
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ requestId: body.requestId, status: "IMPORTED" });
    expect(received).toEqual({
      name: body.name,
      projectTypeId: "00000000-0000-4000-8000-000000000010",
      imported: true,
      createdById: "00000000-0000-4000-8000-000000000011",
      entryDate: "2026-07-17",
      internalProjectNumber: body.internalProjectId,
      state: "Bayern",
    });
    const request = await stored(body.requestId);
    expect(request).toMatchObject({ projectId, status: "IMPORTED" });
    expect(request?.files.map(({ projectVersion }) => projectVersion)).toEqual([1]);
  });

  test("keeps a failed import and recovers it once project creation is available", async () => {
    const projectId = crypto.randomUUID();
    const body = importRequest();
    const unavailable: ProjectCreator = {
      createProject: async () => Result.err(projectErrors.UNAVAILABLE()),
    };

    expect((await post(unavailable, noDownloads, body)).status).toBe(500);
    expect(await stored(body.requestId)).toMatchObject({ projectId: null, status: "FAILED" });

    expect((await post(createdProject(projectId), noDownloads, body)).status).toBe(201);
    expect(await stored(body.requestId)).toMatchObject({ projectId, status: "IMPORTED" });
  });

  test("rejects a changed request under a known identifier", async () => {
    const body = importRequest();
    expect((await post(createdProject(crypto.randomUUID()), noDownloads, body)).status).toBe(201);

    const changed = await post(createdProject(crypto.randomUUID()), noDownloads, {
      ...body,
      name: "Changed name",
    });

    expect(changed.status).toBe(409);
  });

  test("reports a failed download dispatch and dispatches it again on retry", async () => {
    const projectId = crypto.randomUUID();
    const body = importRequest([plan]);
    const dispatched: Parameters<FppDownloadsService["start"]>[0][] = [];
    let available = false;
    const downloads: FppDownloadsService = {
      async start(input) {
        dispatched.push(input);
        return available
          ? Result.ok({ parentJobId: "job" })
          : Result.err(new Error("Temporal unavailable"));
      },
    };

    expect((await post(createdProject(projectId), downloads, body)).status).toBe(503);
    expect(await stored(body.requestId)).toMatchObject({ projectId, status: "IMPORTED" });
    available = true;
    expect((await post(createdProject(crypto.randomUUID()), downloads, body)).status).toBe(201);

    expect(dispatched).toEqual([
      {
        projectId,
        file: {
          url: plan.fileUrl,
          fileName: plan.fileName,
          fileId: expect.any(String),
          fileType: "PLANUNTERLAGEN",
        },
      },
      dispatched[0],
    ]);
  });

  test("rejects foreign projects and conflicting ZIP receipts without changing the source", async () => {
    const projectId = crypto.randomUUID();
    const body = importRequest([plan]);
    expect(
      (
        await post(
          createdProject(projectId),
          { start: async () => Result.ok({ parentJobId: "job" }) },
          body,
        )
      ).status,
    ).toBe(201);
    const fileId = (await stored(body.requestId))?.files[0]?.id ?? "";
    const dmsFileId = crypto.randomUUID();
    const receipt = {
      id: dmsFileId,
      projectId,
      type: "zip" as const,
      filename: "plan.zip",
      bucketPath: "test/plan.zip",
      workflowStatus: "PENDING" as const,
      approvalStatus: null,
      approvalError: null,
      workflowFailureCode: null,
      sourceProjectVersion: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const input = { projectId, projectVersion: 1, fileId, dmsFileId };

    await expect(getFppFile(scope, crypto.randomUUID(), fileId)).rejects.toMatchObject({
      status: 404,
    });
    expect(await getFppFile(scope, projectId, fileId)).toMatchObject({
      fileUrl: plan.fileUrl,
      projectVersion: 1,
      dmsFileId: null,
    });
    await expect(
      confirmFppDownload(
        scope,
        { getZipFile: async () => ({ ...receipt, projectId: crypto.randomUUID() }) },
        input,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      confirmFppDownload(
        scope,
        { getZipFile: async () => receipt },
        { ...input, projectVersion: 2 },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect((await getFppFile(scope, projectId, fileId)).dmsFileId).toBeNull();

    await confirmFppDownload(scope, { getZipFile: async () => receipt }, input);
    await confirmFppDownload(scope, { getZipFile: async () => receipt }, input);
    const replacement = crypto.randomUUID();
    await expect(
      confirmFppDownload(
        scope,
        { getZipFile: async () => ({ ...receipt, id: replacement }) },
        { ...input, dmsFileId: replacement },
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(await getFppFile(scope, projectId, fileId)).toMatchObject({
      dmsFileId,
      downloaded: true,
    });
  });
});
