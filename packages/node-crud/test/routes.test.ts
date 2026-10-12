import { describe, expect, test } from "bun:test";
import { authentication } from "@spark-workflow/authentification";
import { SQL } from "bun";
import { Result } from "better-result";
import { drizzle } from "drizzle-orm/bun-sql";
import { Elysia, status } from "elysia";
import { EvlogError } from "evlog";

import {
  bindNodeRuntime,
  createNodeRoutes as createFeatureRoutes,
  defineNodeDescriptor,
  NodeVersionError,
  type NodeDatabase,
  type NodeDatabaseRow,
  type NodePersistence,
  type NodeRuntime,
  type ProjectVersionPeer,
} from "../src";
import {
  representativeNodeMetadata,
  representativeSchema,
} from "./fixtures/representative-app/schema";
import { emptyNodeRowStream } from "./support/persistence";

process.env.AUTH_MODE = "disabled";

const createTestRoutes = (
  runtime: NodeRuntime<typeof representativeSchema>,
  options: Readonly<{ addUpdateEndpoint?: boolean }> = {},
) =>
  createFeatureRoutes(
    new Elysia({ normalize: false }).use(authentication).onError(({ error }) => {
      if (EvlogError.isEvlogError(error)) {
        return status(error.status, { detail: error.message });
      }
    }),
    runtime,
    () => runtime,
    options,
  );

const databaseUnavailable = (): never => {
  throw new Error("database must not be reached for invalid HTTP input");
};

const databaseTrap = {
  delete: databaseUnavailable,
  insert: databaseUnavailable,
  select: databaseUnavailable,
  update: databaseUnavailable,
} satisfies NodeDatabase<typeof representativeSchema>;

const defineRouteDescriptor = (
  validateWriteVersion: ProjectVersionPeer["validateWriteVersion"] = async () =>
    Result.ok(undefined),
  database: NodeDatabase<typeof representativeSchema> = databaseTrap,
  mutationSeamEvents?: string[],
  resolveLatestVersion: ProjectVersionPeer["resolveLatestVersion"] = async () => Result.ok(1),
  streamRows: NodePersistence<typeof representativeSchema>["streamRows"] = emptyNodeRowStream,
) =>
  bindNodeRuntime(
    defineNodeDescriptor<typeof representativeSchema>({
      name: "representative-app",
      auditLogEnabled: true,
      schema: representativeSchema,
      nodeMetadata: representativeNodeMetadata,
    }),
    {
      persistence: {
        query: async (callback) => callback(database),
        streamRows,
        transact: async (callback) => {
          mutationSeamEvents?.push("transaction");
          return callback();
        },
      },
      versionPeer: {
        validateWriteVersion,
        resolveLatestVersion,
        validateVersionLock: async () => Result.ok(undefined),
      },
      authorizeFields: async () => {
        if (mutationSeamEvents) {
          mutationSeamEvents.push("field authorization");
        }
        return Result.ok(undefined);
      },
    },
  );

const descriptor = defineRouteDescriptor();

const defineMissingMutationRoutes = () => {
  const committedIds: string[] = [];
  let activeDatabase: NodeDatabase<typeof representativeSchema> = databaseTrap;

  const descriptor = defineNodeDescriptor<typeof representativeSchema>({
    name: "missing-mutation-test",
    auditLogEnabled: false,
    schema: representativeSchema,
    nodeMetadata: representativeNodeMetadata,
  });
  const missingMutationDescriptor = bindNodeRuntime(descriptor, {
    persistence: {
      query: async (callback) => callback(activeDatabase),
      streamRows: emptyNodeRowStream,
      transact: async (callback) => {
        const pendingIds: string[] = [];
        const transaction = Object.assign(drizzle.mock({ schema: representativeSchema }), {
          insert: () => ({
            values: (rows: NodeDatabaseRow[]) => ({
              returning: async () =>
                rows.map((row) => {
                  pendingIds.push(`${row.id}`);
                  return {
                    isOutdated: false,
                    frontendParentIds: [],
                    updateType: "AUTOMATED",
                    bio: null,
                    ...row,
                  };
                }),
            }),
          }),
          update: () => ({
            set: (_values: NodeDatabaseRow) => {
              const returning = async () => [];
              return {
                from: () => ({
                  where: () => ({ returning }),
                }),
                where: () => ({
                  returning,
                }),
              };
            },
          }),
        });

        const previous = activeDatabase;
        activeDatabase = transaction;
        try {
          const result = await callback();
          committedIds.push(...pendingIds);
          return result;
        } finally {
          activeDatabase = previous;
        }
      },
    },
    versionPeer: {
      validateWriteVersion: async () => Result.ok(undefined),
      resolveLatestVersion: async () => Result.ok(1),
      validateVersionLock: async () => Result.ok(undefined),
    },
  });

  return {
    routes: createTestRoutes(missingMutationDescriptor),
    committedIds,
  };
};

describe("named Elysia node routes", () => {
  const routes = createTestRoutes(descriptor);
  const projectId = crypto.randomUUID();

  test("rejects an invalid project identifier before persistence", async () => {
    const response = await routes.handle(new Request("http://node.test/not-a-uuid/nodes"));
    expect(response.status).toBe(422);
  });

  test("rejects invalid batch and update input before persistence", async () => {
    const invalidBatch = await routes.handle(
      new Request(`http://node.test/${projectId}/batch-nodes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nodes: [{ nodeType: "unknown", id: crypto.randomUUID() }],
        }),
      }),
    );
    const invalidUpdate = await routes.handle(
      new Request(`http://node.test/${projectId}/update?projectVersion=0`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );
    expect([invalidBatch.status, invalidUpdate.status]).toEqual([422, 422]);
  });

  test("returns a stable semantic batch failure", async () => {
    const nodeId = crypto.randomUUID();
    const database = new Proxy(databaseTrap, {
      get(target, property, receiver) {
        if (property !== "select") return Reflect.get(target, property, receiver);
        return () => ({
          from: () => ({
            where: () => ({
              orderBy: async () => [
                {
                  id: nodeId,
                  projectId: projectId,
                  projectVersion: 1,
                  createdAt: new Date("2026-01-02T03:04:05Z"),
                  updatedAt: new Date("2026-01-02T03:04:05Z"),
                  isDeleted: false,
                  isOutdated: false,
                  frontendParentIds: [],
                  updateType: "AUTOMATED",
                  name: 42,
                  bio: null,
                },
              ],
            }),
          }),
        });
      },
    });
    const semanticRoutes = createTestRoutes(
      defineRouteDescriptor(async () => Result.ok(undefined), database),
    );
    const response = await semanticRoutes.handle(
      new Request(`http://node.test/${projectId}/batch-nodes?projectVersion=1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodes: [{ nodeType: "author", id: nodeId }] }),
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ detail: "Invalid node request" });
  });

  test("rejects an unknown discriminant before persistence", async () => {
    const response = await routes.handle(
      new Request(`http://node.test/${projectId}/batch-nodes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nodes: [{ nodeType: "unknown", id: crypto.randomUUID() }],
        }),
      }),
    );
    expect(response.status).toBe(422);
  });

  test("rejects extra mutation envelope fields before persistence", async () => {
    const validationCalls: [string, number][] = [];
    const schemaFirstRoutes = createTestRoutes(
      defineRouteDescriptor(async (validatedProjectId, projectVersion) => {
        validationCalls.push([validatedProjectId, projectVersion]);
        return Result.ok(undefined);
      }),
    );
    const response = await schemaFirstRoutes.handle(
      new Request(`http://node.test/${projectId}/update?projectVersion=1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inserts: [],
          updates: [],
          deletes: [],
          extra: true,
        }),
      }),
    );
    expect(response.status).toBe(422);
    expect(validationCalls).toEqual([]);
  });

  test("treats an empty parsed update as a no-op before persistence", async () => {
    const validationCalls: [string, number][] = [];
    const noOpRoutes = createTestRoutes(
      defineRouteDescriptor(async (validatedProjectId, projectVersion) => {
        validationCalls.push([validatedProjectId, projectVersion]);
        return Result.ok(undefined);
      }),
    );
    const response = await noOpRoutes.handle(
      new Request(`http://node.test/${projectId}/update?projectVersion=1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          updates: [
            {
              nodeType: "author",
              id: crypto.randomUUID(),
              payload: {},
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      inserted: [],
      updated: [],
      deleted: [],
    });
    expect(validationCalls).toEqual([]);
  });

  test("returns a target conflict before opening a write transaction", async () => {
    const id = crypto.randomUUID();
    const validationCalls: [string, number][] = [];
    const conflictRoutes = createTestRoutes(
      defineRouteDescriptor(async (validatedProjectId, projectVersion) => {
        validationCalls.push([validatedProjectId, projectVersion]);
        return Result.ok(undefined);
      }),
    );
    const response = await conflictRoutes.handle(
      new Request(`http://node.test/${projectId}/update?projectVersion=1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          updates: [{ nodeType: "author", id, payload: { name: "Ada" } }],
          deletes: [{ nodeType: "author", id }],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      detail: `Same node targeted by multiple mutation kinds: author:${id}`,
    });
    expect(validationCalls).toEqual([]);
  });

  test("validates the write version inside the write transaction", async () => {
    const id = crypto.randomUUID();
    const events: string[] = [];
    const rejectedRoutes = createTestRoutes(
      defineRouteDescriptor(
        async (validatedProjectId, projectVersion) => {
          events.push(`validate:${validatedProjectId}:${projectVersion}`);
          return Result.err(
            NodeVersionError({ internal: { message: "Project version is not writable" } }),
          );
        },
        databaseTrap,
        events,
      ),
    );
    const response = await rejectedRoutes.handle(
      new Request(`http://node.test/${projectId}/update?projectVersion=1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          updates: [{ nodeType: "author", id, payload: { name: "Ada" } }],
        }),
      }),
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ detail: "Project version conflict" });
    expect(events).toEqual(["field authorization", "transaction", `validate:${projectId}:1`]);
  });

  test("returns the update batch 404 and rolls back prior work", async () => {
    const { routes: missingRoutes, committedIds } = defineMissingMutationRoutes();
    const response = await missingRoutes.handle(
      new Request(`http://node.test/${projectId}/update?projectVersion=1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inserts: [
            {
              nodeType: "author",
              id: crypto.randomUUID(),
              payload: { name: "Transient" },
            },
          ],
          updates: [
            {
              nodeType: "author",
              id: crypto.randomUUID(),
              payload: { name: "Missing" },
            },
          ],
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      detail: "Update batch affected fewer rows than expected",
    });
    expect(committedIds).toEqual([]);
  });

  test("returns the soft-delete batch 404", async () => {
    const { routes: missingRoutes } = defineMissingMutationRoutes();
    const response = await missingRoutes.handle(
      new Request(`http://node.test/${projectId}/update?projectVersion=1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          deletes: [{ nodeType: "author", id: crypto.randomUUID() }],
        }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      detail: "Delete batch affected fewer rows than expected",
    });
  });

  test("keeps both read routes, accepts version zero, and resolves only omitted versions", async () => {
    const latestResolutionCalls: string[] = [];
    const emptyClient = new SQL();
    Object.defineProperty(emptyClient, "unsafe", {
      value: () => ({ values: async () => [] }),
    });
    const emptyDatabase = drizzle({ client: emptyClient, schema: representativeSchema });
    const readOnlyRoutes = createTestRoutes(
      defineRouteDescriptor(
        async () => Result.ok(undefined),
        emptyDatabase,
        undefined,
        async (resolvedProjectId) => {
          latestResolutionCalls.push(resolvedProjectId);
          return Result.ok(7);
        },
      ),
      { addUpdateEndpoint: false },
    );

    const listResponse = await readOnlyRoutes.handle(
      new Request(`http://node.test/${projectId}/nodes?projectVersion=0`),
    );
    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toEqual({ nodes: [] });

    const batchResponse = await readOnlyRoutes.handle(
      new Request(`http://node.test/${projectId}/batch-nodes?projectVersion=0`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodes: [] }),
      }),
    );
    expect(batchResponse.status).toBe(200);
    expect(await batchResponse.json()).toEqual({ results: [] });

    const invalidBatchResponse = await readOnlyRoutes.handle(
      new Request(`http://node.test/${projectId}/batch-nodes?projectVersion=0`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodes: [{ nodeType: "unknown", id: crypto.randomUUID() }] }),
      }),
    );
    expect(invalidBatchResponse.status).toBe(422);
    expect(latestResolutionCalls).toEqual([]);

    const omittedResponse = await readOnlyRoutes.handle(
      new Request(`http://node.test/${projectId}/nodes`),
    );
    expect(omittedResponse.status).toBe(200);
    expect(latestResolutionCalls).toEqual([projectId]);

    const malformedReadResponse = await readOnlyRoutes.handle(
      new Request(`http://node.test/${projectId}/nodes?projectVersion=not-a-number`),
    );
    expect(malformedReadResponse.status).toBe(422);
    expect(latestResolutionCalls).toEqual([projectId]);
  });

  test("streams ordered node JSON from one bounded combined query", async () => {
    const authorId = crypto.randomUUID();
    const bookId = crypto.randomUUID();
    let statement = "";
    let batchSize = 0;
    const streamRows: NodePersistence<typeof representativeSchema>["streamRows"] = async function* (
      compiled,
      options,
    ) {
      statement = compiled.sql;
      batchSize = options.batchSize;
      yield [
        {
          node_json: JSON.stringify({
            id: authorId,
            nodeType: "author",
            parents: [],
            frontendParentIds: [],
            isOutdated: false,
          }),
        },
        {
          node_json: JSON.stringify({
            id: bookId,
            nodeType: "book",
            parents: [{ id: authorId, nodeType: "author" }],
            frontendParentIds: [],
            isOutdated: false,
          }),
        },
      ];
    };
    const database = drizzle.mock({ schema: representativeSchema });
    const listingRoutes = createTestRoutes(
      defineRouteDescriptor(
        async () => Result.ok(undefined),
        database,
        undefined,
        async () => Result.ok(1),
        streamRows,
      ),
    );

    const response = await listingRoutes.handle(
      new Request(`http://node.test/${projectId}/nodes?projectVersion=1`),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      nodes: [
        {
          id: authorId,
          nodeType: "author",
          parents: [],
          frontendParentIds: [],
          isOutdated: false,
        },
        {
          id: bookId,
          nodeType: "book",
          parents: [{ id: authorId, nodeType: "author" }],
          frontendParentIds: [],
          isOutdated: false,
        },
      ],
    });
    expect(statement).toMatch(/\bunion all\b/i);
    expect(batchSize).toBe(2_048);
  });

  test("cancels the node row stream when the request is aborted", async () => {
    let cleanedUp = false;
    const nodeId = crypto.randomUUID();
    const streamRows: NodePersistence<typeof representativeSchema>["streamRows"] =
      async function* () {
        try {
          yield [
            {
              node_json: JSON.stringify({
                id: nodeId,
                nodeType: "author",
                parents: [],
                frontendParentIds: [],
                isOutdated: false,
              }),
            },
          ];
        } finally {
          cleanedUp = true;
        }
      };
    const runtime = defineRouteDescriptor(
      async () => Result.ok(undefined),
      drizzle.mock({ schema: representativeSchema }),
      undefined,
      async () => Result.ok(1),
      streamRows,
    );
    const abort = new AbortController();
    const response = await createTestRoutes(runtime).handle(
      new Request(`http://node.test/${projectId}/nodes?projectVersion=1`, {
        signal: abort.signal,
      }),
    );

    abort.abort();
    await Bun.sleep(10);

    expect(cleanedUp).toBeTrue();
    await response.body?.cancel();
  });

  test("retains the positive write-version contract", async () => {
    const writeValidationCalls: [string, number][] = [];
    const guardedRoutes = createTestRoutes(
      defineRouteDescriptor(async (validatedProjectId, projectVersion) => {
        writeValidationCalls.push([validatedProjectId, projectVersion]);
        return Result.ok(undefined);
      }),
    );
    const response = await guardedRoutes.handle(
      new Request(`http://node.test/${projectId}/update?projectVersion=0`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(422);
    expect(writeValidationCalls).toEqual([]);
  });

  test("omits update as an ordinary absent route before every mutation seam", async () => {
    const mutationSeamEvents: string[] = [];
    const persistenceUnavailable = (): never => {
      mutationSeamEvents.push("database");
      throw new Error("database must not be reached when update is omitted");
    };
    const persistenceDatabase = {
      delete: persistenceUnavailable,
      insert: persistenceUnavailable,
      select: persistenceUnavailable,
      update: persistenceUnavailable,
    } satisfies NodeDatabase<typeof representativeSchema>;
    const readOnlyRoutes = createTestRoutes(
      defineRouteDescriptor(
        async () => {
          mutationSeamEvents.push("write-version validation");
          return Result.ok(undefined);
        },
        persistenceDatabase,
        mutationSeamEvents,
      ),
      { addUpdateEndpoint: false },
    );
    const request = (path: string) =>
      new Request(`http://node.test/${projectId}/${path}?projectVersion=1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inserts: [{ nodeType: "author", payload: { name: "Ada" } }],
        }),
      });

    const updateResponse = await readOnlyRoutes.handle(request("update"));
    const ordinaryAbsentResponse = await readOnlyRoutes.handle(request("absent-route"));

    expect(updateResponse.status).toBe(404);
    expect({
      status: updateResponse.status,
      contentType: updateResponse.headers.get("content-type"),
      body: await updateResponse.text(),
    }).toEqual({
      status: ordinaryAbsentResponse.status,
      contentType: ordinaryAbsentResponse.headers.get("content-type"),
      body: await ordinaryAbsentResponse.text(),
    });
    expect(mutationSeamEvents).toEqual([]);
  });

  test("publishes update by default and when explicitly enabled", async () => {
    const explicitlyEnabledRoutes = createTestRoutes(descriptor, { addUpdateEndpoint: true });
    for (const app of [routes, explicitlyEnabledRoutes]) {
      const response = await app.handle(
        new Request(`http://node.test/${projectId}/update?projectVersion=1`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({}),
        }),
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ inserted: [], updated: [], deleted: [] });
    }
  });
});
