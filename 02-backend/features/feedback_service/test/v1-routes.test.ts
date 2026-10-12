import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { Result } from "better-result";
import { Projects, type ProjectsResourceService } from "@spark-workflow/core/projects/resource";
import { createFeatureHttp, createHttpHost, type HttpJson } from "@spark-workflow/http-host";
import { PostgreSQL } from "@spark-workflow/postgres-runtime";
import { composeFeatures, defineFeature, provide } from "@spark-workflow/resource";
import type { ResourceRuntime } from "@spark-workflow/resource";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";
import { useStrictAuthentication } from "@spark-workflow/test-support/strict-auth";
import { defineError } from "evlog";

import {
  cleanupMutationScenario,
  countProjectVersionRows,
  createMutationDatabase,
  type MutationDatabase,
} from "./support/mutation-database.ts";

const describeDatabaseTests =
  process.env.FEEDBACK_MUTATION_DATABASE_URL === undefined ? describe.skip : describe;

const projectId = crypto.randomUUID();
const callerSubject = "00000000-0000-0000-0000-00000000000c";
const firstId = "55000000-0000-4000-8000-000000000001";
const secondId = "55000000-0000-4000-8000-000000000002";

const authentication = await useStrictAuthentication([
  `${callerSubject} read project:${projectId}`,
  `${callerSubject} create project:${projectId}`,
  `${callerSubject} update project:${projectId}`,
]);

const { createRoutes, feature } = await import("../src/index.ts");

async function send(
  app: { handle(request: Request): Promise<Response> },
  method: "GET" | "POST",
  path: string,
  body?: HttpJson,
) {
  const init: RequestInit = {
    method,
    headers: {
      ...(await authentication.userToken(callerSubject, ["user"])),
      "content-type": "application/json",
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await app.handle(new Request(`http://localhost${path}`, init));
  return { status: response.status, body: await response.json() };
}

const copyRequest = (overrides: HttpJson) => ({
  sourceVersion: 1,
  targetVersion: 2,
  lockToken: "lock",
  dryRun: true,
  nodes: [{ nodeType: "feedback", id: firstId, overrides }],
});

afterAll(() => {
  authentication.stop();
  mock.restore();
});

describe("feedback v1 request contract", () => {
  const unresolvedApp = (() => {
    const http = createFeatureHttp({
      get: async () => {
        throw new Error("Invalid v1 requests must be rejected before feature resources resolve");
      },
      ready: async () => undefined,
      close: async () => undefined,
    }).for(feature);
    return createHttpHost("feedback-v1-contract-test").use(createRoutes(http));
  })();

  test("rejects the server-owned isOutdated field as a copy-version override", async () => {
    const response = await send(
      unresolvedApp,
      "POST",
      `/${projectId}/copy-version`,
      copyRequest({ isOutdated: false }),
    );

    expect(response.status).toBe(422);
  });
});

const VersionLocked = defineError("feedback-test.LOCKED", {
  status: 409,
  message: "Project version is locked",
});

describeDatabaseTests("feedback v1 routes on the shared node operations", () => {
  let latestVersion = 1;
  const projects: Partial<ProjectsResourceService> = {
    resolveLatestVersion: async () => Result.ok(latestVersion),
    validateWriteVersion: async () => Result.ok(undefined),
    validateVersionLock: async ({ lockToken }) =>
      lockToken === "lock" ? Result.ok(undefined) : Result.err(VersionLocked()),
  };
  let database: MutationDatabase;
  let resources: ResourceRuntime<
    typeof PostgreSQL | (typeof feature.needs)[keyof typeof feature.needs]
  >;
  let app: { handle(request: Request): Promise<Response> };

  beforeAll(async () => {
    database = createMutationDatabase();
    await database.ready();
    resources = makeEffectResourceRuntime(
      composeFeatures([
        feature,
        defineFeature({
          id: "feedback-v1-routes-platform",
          needs: {},
          providers: [
            provide({ resource: PostgreSQL, needs: {}, make: () => database }),
            provide({
              resource: Projects,
              needs: {},
              make: () => projects as ProjectsResourceService,
            }),
          ] as const,
          tables: {},
        }),
      ] as const),
    );
    app = createHttpHost("feedback-v1-routes-test").use(
      createRoutes(createFeatureHttp(resources).for(feature)),
    );
  });

  afterAll(async () => {
    await cleanupMutationScenario(database, projectId);
    await resources.close();
    await database.close();
  });

  test("reads, copies, and undoes feedback through the generic node operations", async () => {
    const payload = (reason: string) => ({
      rating: "positive",
      reason,
      text: null,
      userId: callerSubject,
      frontendParentIds: ["frontend:review"],
      updateType: "manual",
    });
    const seeded = await send(app, "POST", `/${projectId}/update?projectVersion=1`, {
      inserts: [
        { nodeType: "feedback", id: secondId, payload: payload("second") },
        { nodeType: "feedback", id: firstId, payload: payload("first") },
      ],
    });
    expect(seeded.status).toBe(200);
    expect(seeded.body.inserted.map(({ sysPeriod }: { sysPeriod: string }) => sysPeriod)).toEqual([
      expect.any(String),
      expect.any(String),
    ]);

    const listed = await send(app, "GET", `/${projectId}/nodes`);
    expect(listed).toEqual({
      status: 200,
      body: {
        nodes: [firstId, secondId].map((id) => ({
          id,
          nodeType: "feedback",
          parents: [],
          frontendParentIds: ["frontend:review"],
          isOutdated: false,
        })),
      },
    });

    const batch = await send(app, "POST", `/${projectId}/batch-nodes?projectVersion=1`, {
      nodes: [
        { nodeType: "feedback", id: firstId },
        { nodeType: "feedback", id: crypto.randomUUID() },
      ],
    });
    expect(batch.status).toBe(200);
    expect(batch.body.results).toHaveLength(1);
    expect(batch.body.results[0]).toMatchObject({
      nodeType: "feedback",
      id: firstId,
      projectId,
      projectVersion: 1,
      reason: "first",
      userId: callerSubject,
      sysPeriod: expect.any(String),
    });

    const merged = await send(app, "POST", `/${projectId}/copy-version`, {
      ...copyRequest({ reason: "copied" }),
      dryRun: false,
      nodes: [
        { nodeType: "feedback", id: firstId, overrides: { reason: "copied" } },
        { nodeType: "feedback", id: firstId, setOutdated: true, overrides: { text: "merged" } },
      ],
    });
    expect(merged).toEqual({ status: 200, body: { dryRun: false, copied: 1 } });
    const copied = await send(app, "POST", `/${projectId}/batch-nodes?projectVersion=2`, {
      nodes: [{ nodeType: "feedback", id: firstId }],
    });
    expect(copied.body.results[0]).toMatchObject({
      projectVersion: 2,
      reason: "copied",
      text: "merged",
      isOutdated: true,
      userId: callerSubject,
    });

    const conflicting = await send(app, "POST", `/${projectId}/copy-version`, {
      ...copyRequest({}),
      nodes: [
        { nodeType: "feedback", id: firstId, overrides: { text: "one" } },
        { nodeType: "feedback", id: firstId, overrides: { text: "two" } },
      ],
    });
    expect(conflicting.status).toBe(409);

    const lockedUndo = await send(app, "POST", `/${projectId}/undo-version`, {
      targetVersion: 2,
      lockToken: "rejected",
    });
    expect(lockedUndo.status).toBe(409);

    latestVersion = 2;
    const currentUndo = await send(app, "POST", `/${projectId}/undo-version`, {
      targetVersion: 2,
      lockToken: "lock",
    });
    expect(currentUndo).toEqual({
      status: 409,
      body: { detail: "undo-version requires latest version to be lower than targetVersion" },
    });

    latestVersion = 1;
    const undo = await send(app, "POST", `/${projectId}/undo-version`, {
      targetVersion: 2,
      lockToken: "lock",
    });
    expect(undo).toEqual({ status: 200, body: { deleted: { feedback: 1 } } });
    expect(await countProjectVersionRows(database, projectId, 2)).toBe(0);
  });
});
