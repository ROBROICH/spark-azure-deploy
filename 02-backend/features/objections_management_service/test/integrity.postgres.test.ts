import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { DocumentFiles } from "@spark-workflow/core/documents/resource";
import { projectNodesProvider, projectsProvider } from "@spark-workflow/core/projects/runtime";
import { Projects, type ProjectsResourceService } from "@spark-workflow/core/projects/resource";
import {
  projectLogicSchema,
  projects,
  projectVersionLocks,
  subtopics,
  topics,
} from "@spark-workflow/core/projects/schema";
import { createFeatureHttp } from "@spark-workflow/http-host";
import {
  mutateNodes,
  type NodeRuntime,
  type NodeVersionService,
  trustedServiceAuthorization,
} from "@spark-workflow/node-crud";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { better } from "better-drizzle";
import { eq, inArray, sql } from "drizzle-orm";

import {
  argumentsTable,
  beteiligungsEingaenge,
  beteiligungsEingangMarkdown,
  objectionsSchema,
  type ObjectionsSchema,
} from "../src/db/schema.ts";
import { createRoutes, feature } from "../src/index.ts";
import { ObjectionsNodes, objectionsNodesProvider } from "../src/node/descriptor.ts";
import { Objections, type ObjectionsService } from "../src/resource.ts";
import { exportArguments } from "../src/routes/arguments.ts";
import { createObjectionsService } from "../src/routes/ewms.ts";
import { objectionsVersioningProvider } from "../src/runtime.ts";

process.env.AUTH_MODE = "disabled";

const url = process.env.OBJECTIONS_MUTATION_DATABASE_URL;
const schema = { ...projectLogicSchema, ...objectionsSchema, auditLogs };

describe.skipIf(url === undefined)("OMS persistence integrity", () => {
  let database: PostgresResourceRuntime<typeof schema>;
  let projectService: ProjectsResourceService;
  let service: ObjectionsService;
  let runtime: NodeRuntime<ObjectionsSchema>;
  let versions: NodeVersionService;
  const projectIds: string[] = [];

  beforeAll(async () => {
    database = createPostgresRuntime({
      url: url!,
      schema,
      pool: {
        maxConnections: 3,
        idleTimeoutSeconds: 30,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 120,
        closeTimeoutSeconds: 5,
      },
    });
    const nodes = await projectNodesProvider.make({ postgres: database });
    projectService = await projectsProvider.make({ postgres: database, nodes });
    service = createObjectionsService(database.scope(objectionsSchema), projectService);
    runtime = await objectionsNodesProvider.make({ postgres: database, projects: projectService });
    versions = await objectionsVersioningProvider.make({ nodes: runtime });
  });

  afterAll(async () => {
    if (!database) return;
    await database.query(async (query) => {
      await query.delete(argumentsTable).where(inArray(argumentsTable.projectId, projectIds));
      await query
        .delete(beteiligungsEingangMarkdown)
        .where(inArray(beteiligungsEingangMarkdown.projectId, projectIds));
      await query
        .delete(beteiligungsEingaenge)
        .where(inArray(beteiligungsEingaenge.projectId, projectIds));
      await query.delete(subtopics).where(inArray(subtopics.projectId, projectIds));
      await query.delete(topics).where(inArray(topics.projectId, projectIds));
      await query
        .delete(projectVersionLocks)
        .where(inArray(projectVersionLocks.projectId, projectIds));
      await query.delete(auditLogs).where(inArray(auditLogs.projectId, projectIds));
      await query.delete(projects).where(inArray(projects.id, projectIds));
    });
    await database.close();
  });

  const project = async () => {
    const id = crypto.randomUUID();
    projectIds.push(id);
    await database.query((query) =>
      query.insert(projects).values({ id, createdById: crypto.randomUUID() }),
    );
    return id;
  };
  const insertTopic = (id: string, projectId: string, name = id) =>
    database.query((query) =>
      query.insert(topics).values({
        id,
        projectId,
        name,
        showInMvp: false,
        showInEwm: true,
        showInBeschluss: false,
      }),
    );
  const insertSubtopic = (id: string, projectId: string, topicId: string, name = id) =>
    database.query((query) =>
      query.insert(subtopics).values({
        id,
        projectId,
        topicId,
        name,
        showInMvp: false,
        showInEwm: true,
        showInBeschluss: false,
      }),
    );
  const lockVersion = (projectId: string, lockToken = crypto.randomUUID()) =>
    database.query((query) =>
      query.insert(projectVersionLocks).values({
        id: crypto.randomUUID(),
        projectId,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken,
      }),
    );
  const argumentRows = (projectId: string) =>
    database.query((query) =>
      query.select().from(argumentsTable).where(eq(argumentsTable.projectId, projectId)),
    );
  const exportCsv = async (projectId: string) => {
    let csv = "";
    await database.scope(objectionsSchema).query((query) =>
      exportArguments(
        better(query, { schema: objectionsSchema }),
        projectService,
        {
          listProjectFiles: async () => [],
          uploadInternalFile: async ({ content }) => {
            csv = new TextDecoder().decode(content);
            return crypto.randomUUID();
          },
        },
        projectId,
      ),
    );
    return csv;
  };
  const extraction = (documentId: string = crypto.randomUUID()) => ({
    documentArguments: [
      {
        documentId,
        documentName: "E-source.pdf",
        chunkArguments: [
          {
            chunk: { chunkId: "1", pageContent: "Original context", pageNumbers: [1] },
            arguments: [
              {
                argument: { text: "Original", span: { startIdx: 0, endIdx: 8 } },
                description: "Original description",
                context: { text: "Original context", span: { startIdx: 0, endIdx: 16 } },
              },
            ],
          },
        ],
      },
    ],
  });

  test("persists all accepted extraction statuses through node create and patch", async () => {
    const id = await project();
    for (const status of ["loading", "success", "failed", "prompt_injection_error"] as const) {
      const nodeId = crypto.randomUUID();
      const created = await mutateNodes(runtime, trustedServiceAuthorization, id, 1, {
        inserts: [
          {
            nodeType: "beteiligungs_eingang",
            id: nodeId,
            payload: { fileId: crypto.randomUUID(), extractionStatus: status },
          },
        ],
      });
      expect(created.unwrap().inserted[0]?.extractionStatus).toBe(status);
      const patched = await mutateNodes(runtime, trustedServiceAuthorization, id, 1, {
        updates: [
          { nodeType: "beteiligungs_eingang", id: nodeId, payload: { extractionStatus: "loading" } },
        ],
      });
      expect(patched.unwrap().updated[0]?.extractionStatus).toBe("loading");
    }
  });

  test("resumes the original extraction after a lost completion despite changed model output", async () => {
    const id = await project();
    const body = extraction();
    const first = await service.storeExtractionResults(id, 1, body);
    const changed = structuredClone(body);
    changed.documentArguments[0]!.chunkArguments[0]!.arguments[0]!.description =
      "Fresh, unrelated output";
    const resumed = await service.storeExtractionResults(id, 1, changed);
    expect(resumed.results[0]?.skipped).toBe(false);
    expect(resumed.results[0]?.arguments).toEqual(first.results[0]!.arguments);
    expect(resumed.results[0]?.arguments[0]).toMatchObject({
      extractedArgument: body.documentArguments[0]!.chunkArguments[0]!.arguments[0],
    });
    expect(await argumentRows(id)).toHaveLength(1);
  });

  test("a document repeated in one delivery is stored once", async () => {
    const id = await project();
    const body = extraction();
    const repeated = { documentArguments: [...body.documentArguments, ...body.documentArguments] };
    const stored = await service.storeExtractionResults(id, 1, repeated);
    expect(stored.results.map(({ skipped }) => skipped)).toEqual([false, true]);
    expect(stored.results[1]?.beteiligungsEingangId).toBe(stored.results[0]!.beteiligungsEingangId);
    expect(await argumentRows(id)).toHaveLength(1);
  });

  test("rejects historical extraction without changing the retained version", async () => {
    const id = await project();
    await database.query((query) =>
      query.insert(projects).values({ id, projectVersion: 2, createdById: crypto.randomUUID() }),
    );
    await expect(service.storeExtractionResults(id, 1, extraction())).rejects.toMatchObject({
      status: 409,
    });
    expect(
      await database.query((query) =>
        query.select().from(beteiligungsEingaenge).where(eq(beteiligungsEingaenge.projectId, id)),
      ),
    ).toHaveLength(0);
  });

  test("generic node mutations reject a parent of another project", async () => {
    const own = await project();
    const foreign = await project();
    const entry = (await service.storeExtractionResults(foreign, 1, extraction())).results[0]!;
    const badParent = await mutateNodes(runtime, trustedServiceAuthorization, own, 1, {
      inserts: [
        {
          nodeType: "argument",
          payload: { beteiligungsEingangId: entry.beteiligungsEingangId, text: "Wrong parent" },
        },
      ],
    });
    expect(badParent.isErr()).toBe(true);
    expect(await argumentRows(own)).toHaveLength(0);
  });

  test("exports real subtopics and never resolves a foreign or mismatched topic name", async () => {
    const own = await project();
    const foreign = await project();
    const entry = (await service.storeExtractionResults(own, 1, extraction())).results[0]!;
    const argumentId = entry.arguments[0]!.argumentId;
    const main = crypto.randomUUID();
    const other = crypto.randomUUID();
    const sub = crypto.randomUUID();
    const foreignTopic = crypto.randomUUID();
    await insertTopic(main, own, "Local main");
    await insertTopic(other, own, "Local other");
    await insertTopic(foreignTopic, foreign, "Secret foreign topic");
    await insertSubtopic(sub, own, main, "Local sub");
    const bind = (topicId: string, subTopicId: string | null) =>
      database.query((query) =>
        query
          .update(argumentsTable)
          .set({ topicId, subTopicId })
          .where(eq(argumentsTable.id, argumentId)),
      );
    await bind(main, sub);
    expect(await exportCsv(own)).toContain(";Local main;Local sub;");
    await bind(other, sub);
    expect(await exportCsv(own)).toContain(";Local other;;");
    await bind(foreignTopic, null);
    expect(await exportCsv(own)).not.toContain("Secret foreign topic");
  });

  test("failed classification resumes and successful completion is idempotent", async () => {
    const id = await project();
    const body = extraction();
    const entry = (await service.storeExtractionResults(id, 1, body)).results[0]!;
    await service.markClassificationFailed(id, 1, {
      beteiligungsEingangIds: [entry.beteiligungsEingangId],
    });
    expect((await service.storeExtractionResults(id, 1, body)).results[0]?.arguments).toEqual(
      entry.arguments,
    );
    const topicId = crypto.randomUUID();
    await insertTopic(topicId, id);
    const classification = {
      classifiedArguments: [{ argumentId: entry.arguments[0]!.argumentId, topicId }],
    };
    expect(await service.storeClassificationResults(id, 1, classification)).toEqual({
      updatedCount: 1,
    });
    expect(await service.storeClassificationResults(id, 1, classification)).toEqual({
      updatedCount: 0,
    });
    expect((await service.storeExtractionResults(id, 1, body)).results[0]).toMatchObject({
      skipped: true,
      arguments: [],
    });
    expect(
      await service.markClassificationFailed(id, 1, {
        beteiligungsEingangIds: [entry.beteiligungsEingangId],
      }),
    ).toEqual({ updatedCount: 0 });
  });

  test("classification only binds active topics and subtopics of the same parent", async () => {
    const id = await project();
    const foreign = await project();
    const entry = (await service.storeExtractionResults(id, 1, extraction())).results[0]!;
    const argumentId = entry.arguments[0]!.argumentId;
    const main = crypto.randomUUID();
    const other = crypto.randomUUID();
    const sub = crypto.randomUUID();
    const foreignTopic = crypto.randomUUID();
    await insertTopic(main, id);
    await insertTopic(other, id);
    await insertTopic(foreignTopic, foreign);
    await insertSubtopic(sub, id, main);
    for (const classified of [
      { argumentId, topicId: foreignTopic },
      { argumentId, topicId: other, subTopicId: sub },
      { argumentId, topicId: sub },
    ]) {
      await expect(
        service.storeClassificationResults(id, 1, { classifiedArguments: [classified] }),
      ).rejects.toMatchObject({ code: "objections-management.INVALID_REFERENCE" });
    }
    expect(
      await service.storeClassificationResults(id, 1, {
        classifiedArguments: [{ argumentId, topicId: main, subTopicId: sub }],
      }),
    ).toEqual({ updatedCount: 1 });
    expect((await argumentRows(id))[0]).toMatchObject({ topicId: main, subTopicId: sub });
  });

  test("generic node mutations bind arguments to active entries and topics of the version", async () => {
    const id = await project();
    const foreign = await project();
    const entry = (await service.storeExtractionResults(id, 1, extraction())).results[0]!;
    const argumentId = entry.arguments[0]!.argumentId;
    const main = crypto.randomUUID();
    const other = crypto.randomUUID();
    const sub = crypto.randomUUID();
    const foreignTopic = crypto.randomUUID();
    await insertTopic(main, id);
    await insertTopic(other, id);
    await insertTopic(foreignTopic, foreign);
    await insertSubtopic(sub, id, main);
    for (const payload of [
      { topicId: foreignTopic },
      { topicId: other, subTopicId: sub },
      { subTopicId: sub },
      { topicId: sub },
    ]) {
      const result = await mutateNodes(runtime, trustedServiceAuthorization, id, 1, {
        updates: [{ nodeType: "argument", id: argumentId, payload }],
      });
      expect(result.isErr() && result.error.code).toBe("objections-management.INVALID_REFERENCE");
    }
    const bound = await mutateNodes(runtime, trustedServiceAuthorization, id, 1, {
      updates: [{ nodeType: "argument", id: argumentId, payload: { topicId: main, subTopicId: sub } }],
    });
    expect(bound.unwrap().updated[0]).toMatchObject({ topicId: main, subTopicId: sub });

    await database.query((query) =>
      query
        .update(beteiligungsEingaenge)
        .set({ isDeleted: true })
        .where(eq(beteiligungsEingaenge.id, entry.beteiligungsEingangId)),
    );
    const orphan = await mutateNodes(runtime, trustedServiceAuthorization, id, 1, {
      inserts: [
        {
          nodeType: "argument",
          payload: { beteiligungsEingangId: entry.beteiligungsEingangId, text: "Orphan" },
        },
      ],
    });
    expect(orphan.isErr() && orphan.error.code).toBe("objections-management.INVALID_REFERENCE");
    expect(await argumentRows(id)).toHaveLength(1);
  });

  test("a classification must complete every argument of an entry", async () => {
    const id = await project();
    const body = extraction();
    body.documentArguments[0]!.chunkArguments[0]!.arguments.push({
      argument: { text: "Second", span: { startIdx: 0, endIdx: 6 } },
      description: "Second description",
      context: { text: "Second context", span: { startIdx: 0, endIdx: 14 } },
    });
    const entry = (await service.storeExtractionResults(id, 1, body)).results[0]!;
    const topicId = crypto.randomUUID();
    await insertTopic(topicId, id);
    await expect(
      service.storeClassificationResults(id, 1, {
        classifiedArguments: [{ argumentId: entry.arguments[0]!.argumentId, topicId }],
      }),
    ).rejects.toMatchObject({ code: "objections-management.CLASSIFICATION_CONFLICT" });
    expect((await argumentRows(id)).map(({ topicId }) => topicId)).toEqual([null, null]);
  });

  test("an edit after extraction is preserved when stale classification arrives", async () => {
    const id = await project();
    const body = extraction();
    const entry = (await service.storeExtractionResults(id, 1, body)).results[0]!;
    const argumentId = entry.arguments[0]!.argumentId;
    const edited = await mutateNodes(runtime, trustedServiceAuthorization, id, 1, {
      updates: [
        {
          nodeType: "argument",
          id: argumentId,
          payload: { text: "Human corrected text", status: "done" },
        },
      ],
    });
    expect(edited.unwrap().updated[0]?.text).toBe("Human corrected text");
    const topicId = crypto.randomUUID();
    await insertTopic(topicId, id);
    await expect(
      service.storeClassificationResults(id, 1, { classifiedArguments: [{ argumentId, topicId }] }),
    ).rejects.toMatchObject({ code: "objections-management.CLASSIFICATION_CONFLICT" });
    await expect(service.storeExtractionResults(id, 1, body)).rejects.toMatchObject({
      code: "objections-management.EXTRACTION_RECOVERY_REQUIRED",
    });
    const [retained] = await database.query((query) =>
      query.select().from(argumentsTable).where(eq(argumentsTable.id, argumentId)),
    );
    expect(retained).toMatchObject({
      text: "Human corrected text",
      status: "done",
      topicId: null,
      extractionPayload: body.documentArguments[0]!.chunkArguments[0]!.arguments[0],
    });
  });

  test("legacy incomplete arguments need original extraction recovery", async () => {
    const id = await project();
    const body = extraction();
    const entry = (await service.storeExtractionResults(id, 1, body)).results[0]!;
    const argumentId = entry.arguments[0]!.argumentId;
    await database.query((query) =>
      query
        .update(argumentsTable)
        .set({ extractionPayload: null })
        .where(eq(argumentsTable.id, argumentId)),
    );
    await expect(service.storeExtractionResults(id, 1, body)).rejects.toMatchObject({
      code: "objections-management.EXTRACTION_RECOVERY_REQUIRED",
    });
    const [retained] = await database.query((query) =>
      query.select().from(argumentsTable).where(eq(argumentsTable.id, argumentId)),
    );
    expect(retained?.extractionPayload).toBeNull();
  });

  test("all EWMS mutations reject an active copy lock", async () => {
    const id = await project();
    const body = extraction();
    const entry = (await service.storeExtractionResults(id, 1, body)).results[0]!;
    await lockVersion(id);
    await expect(service.storeExtractionResults(id, 1, extraction())).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      service.storeClassificationResults(id, 1, {
        classifiedArguments: [],
        unclassifiedArgumentIds: [entry.arguments[0]!.argumentId],
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.markInjectionDetected(id, 1, {
        documents: [
          { fileId: body.documentArguments[0]!.documentId, documentName: "E-source.pdf" },
        ],
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.markClassificationFailed(id, 1, {
        beteiligungsEingangIds: [entry.beteiligungsEingangId],
      }),
    ).rejects.toMatchObject({ status: 409 });
    const [retained] = await database.query((query) =>
      query
        .select()
        .from(beteiligungsEingaenge)
        .where(eq(beteiligungsEingaenge.id, entry.beteiligungsEingangId)),
    );
    expect(retained).toMatchObject({ extractionStatus: "SUCCESS", classificationStatus: "loading" });
  });

  test("a retained pre-migration foreign parent cannot disclose its file ID", async () => {
    const own = await project();
    const foreign = await project();
    const foreignBody = extraction();
    const entry = (await service.storeExtractionResults(foreign, 1, foreignBody)).results[0]!;
    await database.transact(() =>
      database.query(async (query) => {
        await query.execute(sql`set local session_replication_role = replica`);
        await query.insert(argumentsTable).values({
          id: crypto.randomUUID(),
          projectId: own,
          beteiligungsEingangId: entry.beteiligungsEingangId,
          text: "Invalid old binding",
        });
      }),
    );
    const csv = await exportCsv(own);
    expect(csv).not.toContain(foreignBody.documentArguments[0]!.documentId);
    expect(csv).not.toContain("Invalid old binding");
  });

  test("a same-batch parent is admitted and the original extraction is read-only", async () => {
    const id = await project();
    const parentId = crypto.randomUUID();
    const inserted = await mutateNodes(runtime, trustedServiceAuthorization, id, 1, {
      inserts: [
        {
          nodeType: "beteiligungs_eingang",
          id: parentId,
          payload: { extractionStatus: "loading", fileId: crypto.randomUUID() },
        },
        { nodeType: "argument", payload: { beteiligungsEingangId: parentId, text: "New argument" } },
      ],
    });
    expect(inserted.unwrap().inserted).toHaveLength(2);
    const entry = (await service.storeExtractionResults(id, 1, extraction())).results[0]!;
    const overwrite = mutateNodes(runtime, trustedServiceAuthorization, id, 1, {
      updates: [
        {
          nodeType: "argument",
          id: entry.arguments[0]!.argumentId,
          payload: { extractionPayload: null },
        },
      ],
    });
    await expect(overwrite).rejects.toMatchObject({ status: 422 });
  });

  test("version copies retain the original extraction and reject foreign parent overrides", async () => {
    const own = await project();
    const foreign = await project();
    const entry = (await service.storeExtractionResults(own, 1, extraction())).results[0]!;
    const foreignParent = crypto.randomUUID();
    const lockToken = crypto.randomUUID();
    await database.query((query) =>
      query.insert(beteiligungsEingaenge).values({
        id: foreignParent,
        projectId: foreign,
        projectVersion: 2,
        fileId: crypto.randomUUID(),
        extractionStatus: "SUCCESS",
      }),
    );
    await lockVersion(own, lockToken);
    await expect(
      versions.copyVersion({
        projectId: own,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken,
        dryRun: false,
        nodes: [
          {
            nodeType: "argument",
            id: entry.arguments[0]!.argumentId,
            overrides: { beteiligungsEingangId: foreignParent },
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await versions.copyVersion({
        projectId: own,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken,
        dryRun: false,
        nodes: [
          { nodeType: "beteiligungs_eingang", id: entry.beteiligungsEingangId },
          { nodeType: "argument", id: entry.arguments[0]!.argumentId },
        ],
      }),
    ).toMatchObject({ copied: 2 });
    const rows = await database.query((query) =>
      query
        .select()
        .from(argumentsTable)
        .where(eq(argumentsTable.id, entry.arguments[0]!.argumentId)),
    );
    expect(rows.map(({ extractionPayload }) => extractionPayload)).toEqual([
      entry.arguments[0]!.extractedArgument,
      entry.arguments[0]!.extractedArgument,
    ]);
  });

  test("the OMS version resource rejects topic overrides before copying", async () => {
    const own = await project();
    const entry = (await service.storeExtractionResults(own, 1, extraction())).results[0]!;
    const lockToken = crypto.randomUUID();
    await lockVersion(own, lockToken);
    for (const overrides of [
      { topicId: crypto.randomUUID() },
      { subTopicId: crypto.randomUUID() },
      { topicId: null },
    ]) {
      for (const dryRun of [true, false]) {
        await expect(
          versions.copyVersion({
            projectId: own,
            sourceVersion: 1,
            targetVersion: 2,
            lockToken,
            dryRun,
            nodes: [
              { nodeType: "beteiligungs_eingang", id: entry.beteiligungsEingangId },
              { nodeType: "argument", id: entry.arguments[0]!.argumentId, overrides },
            ],
          }),
        ).rejects.toMatchObject({ status: 422 });
      }
    }
    expect((await argumentRows(own)).map(({ projectVersion }) => projectVersion)).toEqual([1]);
  });

  test("the OMS HTTP copy endpoint rejects unsupported topic overrides", async () => {
    const resources = new Map<string, unknown>([
      [Projects.id, projectService],
      [PostgreSQL.id, database],
      [ObjectionsNodes.id, runtime],
      [Objections.id, service],
      [DocumentFiles.id, {}],
    ]);
    const app = createRoutes(
      createFeatureHttp({
        get: async (resource) => resources.get(resource.id) as never,
        ready: async () => undefined,
        close: async () => undefined,
      }).for(feature),
    );
    const own = await project();
    const entry = (await service.storeExtractionResults(own, 1, extraction())).results[0]!;
    const lockToken = crypto.randomUUID();
    await lockVersion(own, lockToken);
    const copy = (overrides?: { readonly topicId?: string | null; readonly subTopicId?: string | null }) =>
      app.handle(
        new Request(`http://oms.test/${own}/copy-version`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sourceVersion: 1,
            targetVersion: 2,
            lockToken,
            dryRun: false,
            nodes: [
              { nodeType: "beteiligungs_eingang", id: entry.beteiligungsEingangId },
              { nodeType: "argument", id: entry.arguments[0]!.argumentId, overrides },
            ],
          }),
        }),
      );
    for (const overrides of [
      { topicId: crypto.randomUUID() },
      { subTopicId: crypto.randomUUID() },
      { topicId: null },
    ]) {
      const response = await copy(overrides);
      expect(response.status, await response.text()).toBe(422);
    }
    const valid = await copy();
    expect(valid.status, await valid.clone().text()).toBe(200);
    expect(await valid.json()).toMatchObject({ copied: 2 });
  });

  test("OMS copies preserve topic bindings and allow safe subtopic clears", async () => {
    for (const clearSubtopic of [false, true]) {
      const own = await project();
      const entry = (await service.storeExtractionResults(own, 1, extraction())).results[0]!;
      const replacementBody = extraction();
      replacementBody.documentArguments[0]!.chunkArguments = [];
      const replacementParent = (await service.storeExtractionResults(own, 1, replacementBody))
        .results[0]!;
      const topicId = crypto.randomUUID();
      const subTopicId = crypto.randomUUID();
      const lockToken = crypto.randomUUID();
      await insertTopic(topicId, own);
      await insertSubtopic(subTopicId, own, topicId);
      await database.query((query) =>
        query
          .update(argumentsTable)
          .set({ topicId, subTopicId })
          .where(eq(argumentsTable.id, entry.arguments[0]!.argumentId)),
      );
      await lockVersion(own, lockToken);
      const parentId = clearSubtopic
        ? replacementParent.beteiligungsEingangId
        : entry.beteiligungsEingangId;
      const input = {
        projectId: own,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken,
        nodes: [
          { nodeType: "beteiligungs_eingang", id: parentId },
          {
            nodeType: "argument",
            id: entry.arguments[0]!.argumentId,
            overrides: clearSubtopic
              ? { subTopicId: null, beteiligungsEingangId: parentId }
              : undefined,
          },
        ],
      };
      expect(await versions.copyVersion({ ...input, dryRun: true })).toMatchObject({ copied: 2 });
      expect(await versions.copyVersion({ ...input, dryRun: false })).toMatchObject({ copied: 2 });
      const rows = await database.query((query) =>
        query
          .select()
          .from(argumentsTable)
          .where(eq(argumentsTable.id, entry.arguments[0]!.argumentId)),
      );
      expect(rows.find(({ projectVersion }) => projectVersion === 2)).toMatchObject({
        topicId,
        subTopicId: clearSubtopic ? null : subTopicId,
        beteiligungsEingangId: parentId,
        extractionPayload: entry.arguments[0]!.extractedArgument,
      });
    }
  });
});
