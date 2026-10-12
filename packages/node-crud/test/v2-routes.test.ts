import { describe, expect, test } from "bun:test";
import { InvalidRestQueryError } from "@spark-workflow/http-host";
import type { AuthPolicy } from "@spark-workflow/authentification";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Result } from "better-result";
import type { SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { PgDialect, type AnyPgTable } from "drizzle-orm/pg-core";
import { Elysia } from "elysia";
import { EvlogError } from "evlog";

import {
  bindNodeEntityV2Routes,
  bindNodeRuntime,
  createNodeEntityService,
  defineNodeDescriptor,
  NodeDatabaseRowsSchema,
  trustedServiceAuthorization,
  type NodeDatabaseRow,
  type NodePersistence,
} from "../src";
import {
  authors,
  representativeNodeMetadata,
  representativeSchema,
} from "./fixtures/representative-app/schema";
import { emptyNodeRowStream } from "./support/persistence";

const projectId = "71000000-0000-4000-8000-000000000001";
const adaId = "72000000-0000-4000-8000-000000000001";
const graceId = "72000000-0000-4000-8000-000000000002";
const now = new Date("2026-08-29T08:00:00.000Z");
const dialect = new PgDialect();

const descriptor = defineNodeDescriptor({
  name: "representative-app",
  auditLogEnabled: false,
  schema: representativeSchema,
  nodeMetadata: representativeNodeMetadata,
});

const policy = (permission: "create" | "update" | "delete"): AuthPolicy => ({
  permissions: [{ resource: "project", permission, path: "projectId" }],
});

const policies = {
  create: policy("create"),
  update: policy("update"),
  delete: policy("delete"),
} as const;

const authorRow = (id: string, name: string): NodeDatabaseRow => ({
  id,
  projectId,
  projectVersion: 1,
  createdAt: now,
  updatedAt: now,
  isDeleted: false,
  isOutdated: false,
  frontendParentIds: [],
  updateType: "AUTOMATED",
  name,
  bio: null,
});

function databaseFixture(initialRows: readonly NodeDatabaseRow[]) {
  let committed = new Map(initialRows.map((row) => [`${row.id}`, { ...row }]));
  let active: Map<string, NodeDatabaseRow> | undefined;
  let failNextDelete = false;
  const queryScopes: boolean[] = [];

  const rows = () => active ?? committed;
  const predicateRows = (predicate: SQL) => {
    const parameters = dialect.sqlToQuery(predicate).params;
    const knownIds = [...rows().keys()].filter((id) => parameters.includes(id));
    const knownNames = [...new Set([...rows().values()].map((row) => row.name))].filter((name) =>
      parameters.includes(name),
    );
    return [...rows().values()]
      .filter((row) => row.isDeleted === false)
      .filter((row) => knownIds.length === 0 || knownIds.includes(`${row.id}`))
      .filter((row) => knownNames.length === 0 || knownNames.includes(row.name))
      .sort((left, right) => `${left.id}`.localeCompare(`${right.id}`));
  };

  const database = Object.assign(drizzle.mock({ schema: representativeSchema }), {
    select: (selection?: Readonly<{ total: SQL }>) => ({
      from: (table: AnyPgTable) => {
        if (table !== authors) throw new Error("Only the declared author route may query");
        return {
          where: (predicate: SQL) => {
            const selected = predicateRows(predicate);
            if (selection !== undefined) return Promise.resolve([{ total: selected.length }]);
            return {
              orderBy: () =>
                Object.assign(Promise.resolve(selected), {
                  limit: (limit: number) => ({
                    offset: async (offset: number) => selected.slice(offset, offset + limit),
                  }),
                }),
            };
          },
        };
      },
    }),
    insert: (table: AnyPgTable) => {
      if (table !== authors) throw new Error("Only authors may be inserted");
      return {
        values: (values: readonly NodeDatabaseRow[]) => ({
          returning: async () => {
            if (active === undefined) throw new Error("Mutation outside transaction");
            return values.map((value) => {
              const row: NodeDatabaseRow = {
                bio: null,
                frontendParentIds: [],
                isOutdated: false,
                updateType: "AUTOMATED",
                ...value,
              };
              rows().set(`${row.id}`, row);
              return row;
            });
          },
        }),
      };
    },
    update: (table: AnyPgTable) => {
      if (table !== authors) throw new Error("Only authors may be updated");
      return {
        set: (values: NodeDatabaseRow) => ({
          from: (source: SQL) => ({
            where: () => ({
              returning: async () => {
                if (active === undefined) throw new Error("Mutation outside transaction");
                const [serialized] = dialect.sqlToQuery(source).params;
                const changes = Value.Parse(
                  NodeDatabaseRowsSchema,
                  JSON.parse(Value.Parse(Type.String(), serialized)),
                );
                return changes.flatMap((change) => {
                  const current = rows().get(`${change.id}`);
                  if (current === undefined || current.isDeleted === true) return [];
                  const updatedAt = values.updatedAt;
                  if (updatedAt === undefined) throw new Error("Update omitted updatedAt");
                  const updated = {
                    ...current,
                    ...Object.fromEntries(
                      Object.entries(change).filter(([field]) => field !== "id"),
                    ),
                    updatedAt,
                  };
                  rows().set(`${change.id}`, updated);
                  return [updated];
                });
              },
            }),
          }),
          where: (predicate: SQL) => ({
            returning: async () => {
              if (active === undefined) throw new Error("Mutation outside transaction");
              const targets = predicateRows(predicate);
              const deleted = targets.map((target) => ({ ...target, ...values }));
              for (const row of deleted) rows().set(`${row.id}`, row);
              if (failNextDelete) {
                failNextDelete = false;
                return [];
              }
              return deleted;
            },
          }),
        }),
      };
    },
  });

  const persistence: NodePersistence<typeof representativeSchema> = {
    query: (callback) => {
      queryScopes.push(active !== undefined);
      return callback(database);
    },
    streamRows: emptyNodeRowStream,
    async transact(callback) {
      if (active !== undefined) throw new Error("Nested transaction");
      active = new Map([...committed].map(([id, row]) => [id, { ...row }]));
      try {
        const result = await callback();
        committed = active;
        return result;
      } finally {
        active = undefined;
      }
    },
  };

  const runtime = bindNodeRuntime(descriptor, {
    persistence,
    versionPeer: {
      validateWriteVersion: async () => Result.ok(undefined),
      resolveLatestVersion: async () => Result.ok(1),
      validateVersionLock: async () => Result.ok(undefined),
    },
    authorizeFields: async () => Result.ok(undefined),
  });

  return {
    runtime,
    failDelete() {
      failNextDelete = true;
    },
    get rows() {
      return committed;
    },
    drainQueryScopes() {
      return queryScopes.splice(0);
    },
  };
}

function createTestApp(
  fixture: ReturnType<typeof databaseFixture>,
  filters: readonly string[] = ["name"],
) {
  const seenPolicies: AuthPolicy[] = [];
  const app = new Elysia({ normalize: false })
    .macro({
      auth: (authPolicy: AuthPolicy) => ({
        resolve: () => ({ auth: trustedServiceAuthorization }),
        beforeHandle() {
          seenPolicies.push(authPolicy);
        },
      }),
    })
    .onError(({ code, error, set }) => {
      if (EvlogError.isEvlogError(error)) {
        set.status = error.status;
        return { detail: error.message };
      }
      if (error instanceof InvalidRestQueryError) {
        set.status = 400;
        return { detail: error.message };
      }
      if (code === "VALIDATION") {
        set.status = 422;
        return { detail: error.message };
      }
    });
  return {
    app: bindNodeEntityV2Routes(
      app,
      descriptor,
      () => createNodeEntityService(fixture.runtime, "author"),
      {
        nodeType: "author",
        collection: "authors",
        filters,
        auth: policies,
      },
      "authors",
    ),
    seenPolicies,
  };
}

const collectionPath = `/projects/${projectId}/authors`;
const itemPath = (id: string) => `${collectionPath}/${id}`;
const url = (path: string) => `http://node.test${path}`;
const request = (path: string, init?: RequestInit) => new Request(url(path), init);

describe("explicit node v2 REST binding", () => {
  test("binds five methods and executes their declared write policies", async () => {
    const fixture = databaseFixture([authorRow(adaId, "Ada")]);
    const { app, seenPolicies } = createTestApp(fixture);

    const listed = await app.handle(request(`${collectionPath}?projectVersion=1`));
    expect(listed.status).toBe(200);

    const created = await app.handle(
      request(`${collectionPath}?projectVersion=1`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "New author" }),
      }),
    );
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody).toMatchObject({ name: "New author", isDeleted: false });

    const fetched = await app.handle(request(`${itemPath(createdBody.id)}?projectVersion=1`));
    expect(fetched.status).toBe(200);

    const updated = await app.handle(
      request(`${itemPath(createdBody.id)}?projectVersion=1`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Updated author" }),
      }),
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ id: createdBody.id, name: "Updated author" });

    const deleted = await app.handle(
      request(`${itemPath(createdBody.id)}?projectVersion=1`, { method: "DELETE" }),
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({
      id: createdBody.id,
      name: "Updated author",
      isDeleted: true,
    });

    expect(seenPolicies).toEqual([policies.create, policies.update, policies.delete]);
  });

  test("requires a version and supports page, cursor, and named filter queries", async () => {
    const fixture = databaseFixture([authorRow(adaId, "Ada"), authorRow(graceId, "Grace")]);
    const { app } = createTestApp(fixture);

    const missingVersion = await app.handle(request(collectionPath));
    expect(missingVersion.status).toBe(422);
    for (const projectVersion of ["0", "1.5"]) {
      const invalidVersion = await app.handle(
        request(`${collectionPath}?projectVersion=${projectVersion}`),
      );
      expect(invalidVersion.status, projectVersion).toBe(422);
    }

    const first = await app.handle(request(`${collectionPath}?projectVersion=1&limit=1&page=1`));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    const nextCursor = Value.Parse(Type.String(), firstBody.pagination.nextCursor);
    expect(firstBody).toMatchObject({
      data: [{ id: adaId }],
      pagination: { page: 1, limit: 1, total: 2 },
    });

    const second = await app.handle(
      request(`${collectionPath}?projectVersion=1&limit=1&cursor=${nextCursor}`),
    );
    expect(await second.json()).toMatchObject({
      data: [{ id: graceId }],
      pagination: { page: 2, limit: 1, total: 2, nextCursor: null },
    });

    const filtered = await app.handle(request(`${collectionPath}?projectVersion=1&name=Grace`));
    expect(await filtered.json()).toMatchObject({
      data: [{ id: graceId, name: "Grace" }],
      pagination: { limit: 50, total: 1 },
    });

    const repeatedFilter = await app.handle(
      request(`${collectionPath}?projectVersion=1&name=Ada&name=Grace`),
    );
    expect(await repeatedFilter.json()).toMatchObject({ pagination: { total: 2 } });

    for (const query of [
      "projectVersion=1&unknown=x",
      "projectVersion=1&projectVersion=2",
      "projectVersion=1&limit=1&limit=2",
      "projectVersion=1&page=1&cursor=MA",
    ]) {
      const response = await app.handle(request(`${collectionPath}?${query}`));
      expect(response.status, query).toBe(400);
    }
    for (const query of ["projectVersion=1&unknown=x", "projectVersion=1&projectVersion=2"]) {
      const response = await app.handle(request(`${itemPath(adaId)}?${query}`));
      expect(response.status, query).toBe(400);
    }
    const tooLarge = await app.handle(request(`${collectionPath}?projectVersion=1&limit=201`));
    expect(tooLarge.status).toBe(422);
  });

  test("rolls back a failed soft delete and returns the row on success", async () => {
    const fixture = databaseFixture([authorRow(adaId, "Ada")]);
    const { app } = createTestApp(fixture);
    fixture.failDelete();

    const failed = await app.handle(
      request(`${itemPath(adaId)}?projectVersion=1`, { method: "DELETE" }),
    );
    expect(failed.status).toBe(404);
    expect(fixture.rows.get(adaId)?.isDeleted).toBe(false);
    expect(fixture.drainQueryScopes()).toEqual([true]);

    const deleted = await app.handle(
      request(`${itemPath(adaId)}?projectVersion=1`, { method: "DELETE" }),
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({ id: adaId, isDeleted: true });
    expect(fixture.rows.get(adaId)?.isDeleted).toBe(true);
    expect(fixture.drainQueryScopes()).toEqual([true]);
  });

  test("returns the current row for an empty patch no-op", async () => {
    const fixture = databaseFixture([authorRow(adaId, "Ada")]);
    const { app } = createTestApp(fixture);
    const response = await app.handle(
      request(`${itemPath(adaId)}?projectVersion=1`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: adaId, name: "Ada" });
    expect(fixture.drainQueryScopes()).toEqual([false]);
  });

  test("rejects non-scalar public filter declarations at binding time", () => {
    const fixture = databaseFixture([authorRow(adaId, "Ada")]);
    expect(() => createTestApp(fixture, ["frontendParentIds"])).toThrow(
      "Invalid node REST filter 'author.frontendParentIds'",
    );
  });

  test("does not expose another descriptor node without another binding", async () => {
    const fixture = databaseFixture([authorRow(adaId, "Ada")]);
    const { app } = createTestApp(fixture);
    const response = await app.handle(request(`/projects/${projectId}/books?projectVersion=1`));
    expect(response.status).toBe(404);
  });
});
