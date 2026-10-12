import { describe, expect, test } from "bun:test";
import { createFeatureHttp } from "@spark-workflow/http-host";
import {
  PostgreSQL,
  type PostgresSchema,
  type PostgresScope,
  type PostgreSQLService,
} from "@spark-workflow/postgres-runtime";
import {
  defineFeature,
  defineResource,
  type ResourceRuntime,
  type ResourceValue,
} from "@spark-workflow/resource";
import { Result } from "better-result";

import {
  bindNodeRuntime,
  createNodeEntityResourceRoutes,
  defineNodeDescriptor,
  defineNodeEntities,
  nodeV2AuthPolicies,
  type NodeEntityService,
  type NodePersistence,
} from "../src";
import {
  representativeNodeMetadata,
  representativeSchema,
} from "./fixtures/representative-app/schema";
import { emptyNodeRowStream } from "./support/persistence";

process.env.AUTH_MODE = "disabled";

const descriptor = defineNodeDescriptor({
  name: "entity-resource-test",
  auditLogEnabled: false,
  schema: representativeSchema,
  nodeMetadata: representativeNodeMetadata,
});
const persistence: NodePersistence<typeof representativeSchema> = {
  query: async () => {
    throw new Error("Entity declaration test must not query");
  },
  streamRows: emptyNodeRowStream,
  transact: (callback) => callback(),
};
const runtime = bindNodeRuntime(descriptor, {
  persistence,
  versionPeer: {
    validateWriteVersion: async () => Result.ok(undefined),
    resolveLatestVersion: async () => Result.ok(1),
    validateVersionLock: async () => Result.ok(undefined),
  },
});

describe("node entity Resources", () => {
  test("binds HTTP routes to the entity service Resource", async () => {
    const calls: string[] = [];
    const authorService: NodeEntityService = {
      async paginate() {
        calls.push("paginate");
        return {
          items: [
            {
              nodeType: "author",
              id: "72000000-0000-4000-8000-000000000001",
              projectId: "71000000-0000-4000-8000-000000000001",
              projectVersion: 1,
              createdAt: "2026-08-29T08:00:00Z",
              updatedAt: "2026-08-29T08:00:00Z",
              isDeleted: false,
              isOutdated: false,
              frontendParentIds: [],
              updateType: "automated",
              name: "Ada",
              bio: null,
            },
          ],
          total: 1,
        };
      },
      async findUnique() {
        throw new Error("Unexpected findUnique");
      },
      async create() {
        throw new Error("Unexpected create");
      },
      async update() {
        throw new Error("Unexpected update");
      },
      async delete() {
        throw new Error("Unexpected delete");
      },
    };
    const httpEntities = defineNodeEntities({
      id: "node-crud-test/HttpEntity",
      controller: "node-crud-test.http-entity",
      descriptor,
      nodes: defineResource<typeof runtime>()("node-crud-test/HttpNodes"),
      needs: {},
      entities: [
        {
          nodeType: "author",
          collection: "authors",
          filters: ["name"],
          auth: nodeV2AuthPolicies,
        },
      ] as const,
    });
    const httpFeature = defineFeature({
      id: "node-crud-test.http-feature",
      needs: { ...httpEntities.needs },
      providers: [...httpEntities.providers] as const,
      tables: representativeSchema,
    });
    const postgresql: PostgreSQLService = {
      scope<Schema extends PostgresSchema>(): PostgresScope<Schema> {
        return {
          query: async () => {
            throw new Error("HTTP entity binding test must not query PostgreSQL");
          },
          streamRows: emptyNodeRowStream,
          transact: (callback) => callback(),
        };
      },
    };
    type Available = typeof PostgreSQL | (typeof httpEntities.needs)["v2:author"];
    const resources: ResourceRuntime<Available> = {
      async get<Value extends Available>(resource: Value): Promise<ResourceValue<Value>> {
        return (resource === PostgreSQL ? postgresql : authorService) as ResourceValue<Value>;
      },
      ready: async () => undefined,
      close: async () => undefined,
    };
    const app = createNodeEntityResourceRoutes(
      createFeatureHttp(resources).for(httpFeature),
      httpEntities,
    );
    const response = await app.handle(
      new Request(
        "http://test/projects/71000000-0000-4000-8000-000000000001/authors?projectVersion=1",
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: [{ id: "72000000-0000-4000-8000-000000000001", name: "Ada" }],
      pagination: { total: 1 },
    });
    expect(calls).toEqual(["paginate"]);
  });
});
