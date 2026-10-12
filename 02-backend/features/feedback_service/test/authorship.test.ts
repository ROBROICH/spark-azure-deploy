import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { Result } from "better-result";
import { Projects, type ProjectsResourceService } from "@spark-workflow/core/projects/resource";
import { createFeatureHttp, createHttpHost, type HttpJson } from "@spark-workflow/http-host";
import { PostgreSQL } from "@spark-workflow/postgres-runtime";
import { composeFeatures, defineFeature, provide } from "@spark-workflow/resource";
import type { ResourceRuntime } from "@spark-workflow/resource";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";
import { useStrictAuthentication } from "@spark-workflow/test-support/strict-auth";

import {
  cleanupMutationScenario,
  createMutationDatabase,
  readProjectState,
  type MutationDatabase,
} from "./support/mutation-database.ts";

const describeAuthorshipTests =
  process.env.FEEDBACK_MUTATION_DATABASE_URL === undefined ? describe.skip : describe;

const projectId = crypto.randomUUID();
const callerSubject = "00000000-0000-0000-0000-00000000000a";
const foreignSubject = "00000000-0000-0000-0000-00000000000b";

const authentication = await useStrictAuthentication([
  `${callerSubject} read project:${projectId}`,
  `${callerSubject} create project:${projectId}`,
  `${callerSubject} update project:${projectId}`,
]);


const { createRoutes, createV2Routes, feature } = await import("../src/index.ts");

const unresolvedApp = (() => {
  const http = createFeatureHttp({
    get: async () => {
      throw new Error("An author change must be rejected before feature resources resolve");
    },
    ready: async () => undefined,
    close: async () => undefined,
  }).for(feature);
  return createHttpHost("feedback-authorship-test")
    .group("/v1", (group) => group.use(createRoutes(http)))
    .group("/v2", (group) => group.use(createV2Routes(http)));
})();

async function send(
  app: { handle(request: Request): Promise<Response> },
  method: "POST" | "PATCH",
  path: string,
  body: HttpJson,
) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        ...(await authentication.userToken(callerSubject, ["user"])),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    }),
  );
  return { status: response.status, body: await response.json() };
}

const feedbackId = "54000000-0000-4000-8000-000000000001";
const feedbackPayload = (userId: string) => ({
  rating: "positive",
  reason: null,
  text: "Clear explanation",
  userId,
  frontendParentIds: [],
  updateType: "manual",
});

afterAll(() => {
  authentication.stop();
  mock.restore();
});

describe("feedback authorship", () => {
  test("rejects malformed composite parents before resolving persistence", async () => {
    for (const parent of ["invalid", ":id", "fundstelle:"]) {
      const payload = { ...feedbackPayload(callerSubject), frontendParentIds: [parent] };
      expect(
        (
          await send(unresolvedApp, "POST", `/v1/${projectId}/update?projectVersion=1`, {
            inserts: [{ nodeType: "feedback", payload }],
          })
        ).status,
      ).toBe(422);
      expect(
        (
          await send(
            unresolvedApp,
            "PATCH",
            `/v2/projects/${projectId}/feedback/${feedbackId}?projectVersion=1`,
            { frontendParentIds: [parent] },
          )
        ).status,
      ).toBe(422);
    }
  });

  test("rejects every request that names a new author for existing feedback", async () => {
    for (const [method, path, body] of [
      [
        "POST",
        `/v1/${projectId}/update?projectVersion=1`,
        {
          updates: [{ nodeType: "feedback", id: feedbackId, payload: { userId: foreignSubject } }],
        },
      ],
      [
        "POST",
        `/v1/${projectId}/copy-version`,
        {
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: "lock",
          dryRun: false,
          nodes: [{ nodeType: "feedback", id: feedbackId, overrides: { userId: foreignSubject } }],
        },
      ],
      [
        "PATCH",
        `/v2/projects/${projectId}/feedback/${feedbackId}?projectVersion=1`,
        { userId: foreignSubject },
      ],
    ] as const) {
      expect((await send(unresolvedApp, method, path, body)).status).toBe(422);
    }
  });
});

describeAuthorshipTests("feedback authorship persistence", () => {
  const projects: Partial<ProjectsResourceService> = {
    resolveLatestVersion: async () => Result.ok(1),
    validateWriteVersion: async () => Result.ok(undefined),
    validateVersionLock: async () => Result.ok(undefined),
  };
  let database: MutationDatabase;
  let resources: ResourceRuntime<typeof PostgreSQL>;
  let app: { handle(request: Request): Promise<Response> };

  beforeAll(async () => {
    database = createMutationDatabase();
    await database.ready();
    const runtime = makeEffectResourceRuntime(
      composeFeatures([
        feature,
        defineFeature({
          id: "feedback-authorship-platform",
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
    resources = runtime;
    const http = createFeatureHttp(runtime).for(feature);
    app = createHttpHost("feedback-authorship-persistence-test")
      .group("/v1", (group) => group.use(createRoutes(http)))
      .group("/v2", (group) => group.use(createV2Routes(http)));
  });

  afterAll(async () => {
    await cleanupMutationScenario(database, projectId);
    await resources.close();
    await database.close();
  });

  test("records the calling user as author whatever author the body names", async () => {
    const legacy = await send(app, "POST", `/v1/${projectId}/update?projectVersion=1`, {
      inserts: [{ nodeType: "feedback", id: feedbackId, payload: feedbackPayload(foreignSubject) }],
    });
    const created = await send(
      app,
      "POST",
      `/v2/projects/${projectId}/feedback?projectVersion=1`,
      feedbackPayload(foreignSubject),
    );

    expect(legacy.status).toBe(200);
    expect(legacy.body.inserted[0].userId).toBe(callerSubject);
    expect(created.status).toBe(201);
    expect(created.body.userId).toBe(callerSubject);
    const { current } = await readProjectState(database, projectId);
    expect(current.map(({ userId }) => userId)).toEqual([callerSubject, callerSubject]);
  });

  test("both mutation routes round-trip lowercase rating changes through PostgreSQL", async () => {
    const patched = await send(
      app,
      "PATCH",
      `/v2/projects/${projectId}/feedback/${feedbackId}?projectVersion=1`,
      { rating: "negative" },
    );
    expect(patched.status).toBe(200);
    expect(patched.body.rating).toBe("negative");
    const updated = await send(app, "POST", `/v1/${projectId}/update?projectVersion=1`, {
      updates: [
        {
          nodeType: "feedback",
          id: feedbackId,
          payload: { rating: "positive", text: "Corrected", frontendParentIds: ["fundstelle:1"] },
        },
      ],
    });
    expect(updated.status).toBe(200);
    expect(updated.body.updated[0].rating).toBe("positive");
    const { current, history } = await readProjectState(database, projectId);
    expect(current.find(({ id }) => id === feedbackId)).toMatchObject({
      rating: "positive",
      text: "Corrected",
      frontendParentIds: ["fundstelle:1"],
      userId: callerSubject,
    });
    expect(history.filter(({ id }) => id === feedbackId).map(({ rating }) => rating)).toEqual([
      "positive",
      "negative",
    ]);
  });
});
