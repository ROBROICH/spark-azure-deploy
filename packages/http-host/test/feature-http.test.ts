import { describe, expect, test } from "bun:test";
import {
  PostgreSQL,
  type PostgresSchema,
  type PostgreSQLService,
} from "@spark-workflow/postgres-runtime";
import {
  defineFeature,
  defineResource,
  type ResourceRuntime,
  type ResourceValue,
} from "@spark-workflow/resource";
import { Elysia, t } from "elysia";

import { createFeatureHttp } from "../src/index.ts";

process.env.AUTH_MODE = "disabled";

interface ProjectsService {
  find(id: string): Promise<string>;
}

const Projects = defineResource<ProjectsService>()("http-host-test/Projects");
const feature = defineFeature({
  id: "feature-http-test",
  needs: { projects: Projects },
  providers: [],
  tables: {},
});

describe("feature HTTP capability", () => {
  test("injects declared Resources and PostgreSQL scope", async () => {
    const projects: ProjectsService = {
      find: async (id) => `project:${id}`,
    };
    let scopedSchema: PostgresSchema | undefined;
    const postgresql: PostgreSQLService = {
      scope: (schema) => {
        scopedSchema = schema;
        return {
          query: async () => {
            throw new Error("The test route must not query PostgreSQL");
          },
          streamRows: async function* () {
            yield* [];
          },
          transact: (callback) => callback(),
        };
      },
    };
    const resources: ResourceRuntime<typeof Projects | typeof PostgreSQL> = {
      get: async <Value extends typeof Projects | typeof PostgreSQL>(resource: Value) =>
        (resource === PostgreSQL ? postgresql : projects) as ResourceValue<Value>,
      ready: async () => undefined,
      close: async () => undefined,
    };
    const http = createFeatureHttp(resources).for(feature);
    const app = new Elysia().use(
      http.controller("feature-http.test").get(
        "/projects/:id",
        async ({ params, postgres, projects }) => ({
          project: await projects.find(params.id),
          postgres: "query" in postgres,
        }),
        {
          params: t.Object({ id: t.String() }),
          projects: true,
        },
      ),
    );

    const response = await app.handle(
      new Request("http://test/projects/42", {
        headers: {
          "x-forwarded-client-cert": "URI=spiffe://cluster/ns/test/sa/test",
        },
      }),
    );
    const body = await response.text();
    if (response.status !== 200) throw new Error(body);
    expect(response.status).toBe(200);
    expect(JSON.parse(body)).toEqual({ project: "project:42", postgres: true });
    expect(scopedSchema).toBe(feature.tables);
  });
});
