import { describe, expect, test } from "bun:test";
import { PostgreSQL, type PostgreSQLService } from "@spark-workflow/postgres-runtime";
import {
  defineFeature,
  defineResource,
  type ResourceRuntime,
  type ResourceValue,
} from "@spark-workflow/resource";
import { Result } from "better-result";
import { t } from "elysia";
import { createError } from "evlog";

import { createFeatureHttp, createHttpHost, type ProjectVersionSource } from "../src/index.ts";

process.env.AUTH_MODE = "disabled";

const knownProject = "40000000-0000-4000-8000-000000000001";
const missingProject = "40000000-0000-4000-8000-000000000002";

const Projects = defineResource<ProjectVersionSource>()("project-version-test/Projects");
const Catalog = defineResource<{ find(id: string): Promise<string> }>()(
  "project-version-test/Catalog",
);
const versionedFeature = defineFeature({
  id: "project-version-test",
  needs: { projects: Projects },
  providers: [],
  tables: {},
});
const catalogFeature = defineFeature({
  id: "project-version-test-catalog",
  needs: { projects: Catalog },
  providers: [],
  tables: {},
});

const postgres: PostgreSQLService = {
  scope: () => ({
    query: async () => {
      throw new Error("The test routes must not query PostgreSQL");
    },
    streamRows: async function* () {
      yield* [];
    },
    transact: (callback) => callback(),
  }),
};
const projects: ProjectVersionSource = {
  resolveLatestVersion: async (projectId) =>
    projectId === knownProject
      ? Result.ok(4)
      : Result.err(createError({ status: 404, message: `Project ${projectId} not found` })),
};
type Available = typeof PostgreSQL | typeof Projects | typeof Catalog;
const resources: ResourceRuntime<Available> = {
  get: async <Value extends Available>(resource: Value) =>
    (resource === PostgreSQL ? postgres : projects) as ResourceValue<Value>,
  ready: async () => undefined,
  close: async () => undefined,
};

const app = createHttpHost("project-version-test").use(
  createFeatureHttp(resources)
    .for(versionedFeature)
    .controller("project-version-test")
    .get("/requested/:projectId", ({ projectVersion }) => ({ projectVersion }), {
      projectVersion: true,
      query: t.Object({ limit: t.Optional(t.Numeric()) }, { additionalProperties: false }),
    })
    .get("/latest/:projectId", ({ projectVersion }) => ({ projectVersion }), {
      latestProjectVersion: true,
    }),
);

const get = async (path: string) => {
  const response = await app.handle(new Request(`http://localhost${path}`));
  return { status: response.status, body: await response.json() };
};

describe("project version macros", () => {
  test("resolve the requested version or the latest one", async () => {
    expect(await get(`/requested/${knownProject}?projectVersion=2&limit=5`)).toEqual({
      status: 200,
      body: { projectVersion: 2 },
    });
    expect(await get(`/requested/${knownProject}`)).toEqual({
      status: 200,
      body: { projectVersion: 4 },
    });
    expect(await get(`/latest/${knownProject}?projectVersion=2`)).toEqual({
      status: 200,
      body: { projectVersion: 4 },
    });
  });

  test("reject an invalid version and answer the resolution error", async () => {
    expect((await get(`/requested/${knownProject}?projectVersion=0`)).status).toBe(422);
    expect(await get(`/requested/${missingProject}`)).toEqual({
      status: 404,
      body: { detail: `Project ${missingProject} not found` },
    });
  });

  test("exist only for a feature whose projects need resolves versions", () => {
    const routes = createFeatureHttp(resources)
      .for(catalogFeature)
      .controller("project-version-test-catalog")
      .get("/requested/:projectId", () => "unreachable", {
        // @ts-expect-error
        projectVersion: true,
      });
    expect(routes).toBeDefined();
  });
});
