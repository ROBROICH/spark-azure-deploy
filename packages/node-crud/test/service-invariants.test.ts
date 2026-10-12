import { describe, expect, test } from "bun:test";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Result } from "better-result";
import { getTableColumns, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { type AnyPgTable, PgDialect } from "drizzle-orm/pg-core";

import {
  assertUniqueMutationTargets,
  batchNodes,
  bindNodeRuntime,
  collectFieldAuthorizationChecks,
  defineNodeDescriptor,
  mutateNodes,
  NodeDatabaseRowsSchema,
  NodeVersionError,
  nodePayload,
  type NodeDatabaseRow,
  type NodeDatabase,
  type NodeDefinition,
} from "../src";
import {
  authors,
  books,
  representativeNodeMetadata,
  representativeNodes,
  representativeSchema,
} from "./fixtures/representative-app/schema";
import { emptyNodeRowStream } from "./support/persistence";

const author = representativeNodes.find(({ nodeType }) => nodeType === "author")!;

const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const AUTHOR_ONE = "20000000-0000-4000-8000-000000000001";
const AUTHOR_TWO = "20000000-0000-4000-8000-000000000002";
const BOOK_ONE = "30000000-0000-4000-8000-000000000001";
const BOOK_TWO = "30000000-0000-4000-8000-000000000002";
const MISSING = "40000000-0000-4000-8000-000000000001";

const commonRow = (id: string) => ({
  id,
  projectId: PROJECT_ID,
  projectVersion: 1,
  createdAt: new Date("2026-07-16T10:00:00.000Z"),
  updatedAt: new Date("2026-07-16T10:01:00.000Z"),
  isDeleted: false,
  isOutdated: false,
  frontendParentIds: [],
  updateType: "AUTOMATED",
});

const descriptorForRows = (
  rows: ReadonlyMap<AnyPgTable, readonly NodeDatabaseRow[]>,
  calls: string[],
) =>
  bindNodeRuntime(
    defineNodeDescriptor<typeof representativeSchema>({
      name: "batch-invariant-test",
      auditLogEnabled: true,
      schema: representativeSchema,
      nodeMetadata: representativeNodeMetadata,
    }),
    {
      persistence: {
        query: async (callback) =>
          callback({
            select: () => ({
              from: (table: AnyPgTable) => ({
                where: () => ({
                  orderBy: async () => {
                    calls.push(table === authors ? "author" : table === books ? "book" : "unknown");
                    return rows.get(table) ?? [];
                  },
                }),
              }),
            }),
          } as never),
        streamRows: emptyNodeRowStream,
        transact: async () => {
          throw new Error("batch reads must not open a transaction");
        },
      },
      versionPeer: {
        validateWriteVersion: async () => Result.ok(undefined),
        resolveLatestVersion: async () => Result.ok(1),
        validateVersionLock: async () => Result.ok(undefined),
      },
    },
  );

describe("node mutation invariants", () => {
  test("deduplicates field checks and honors explicit ignore values", () => {
    expect(
      collectFieldAuthorizationChecks([
        {
          action: "create",
          node: author,
          payload: { name: "Ada", bio: null },
        },
        {
          action: "create",
          node: author,
          payload: { name: "Grace", bio: "" },
        },
      ]),
    ).toEqual([
      {
        action: "create",
        nodeType: "author",
        field: "name",
        permissions: ["create"],
        value: "Ada",
      },
    ]);
  });

  test("rejects duplicate and conflicting mutation targets before persistence", () => {
    const id = crypto.randomUUID();
    expect(() =>
      assertUniqueMutationTargets({
        inserts: [],
        updates: [{ nodeType: "author", id, payload: { name: "new" } }],
        deletes: [{ nodeType: "author", id }],
      }),
    ).toThrow("Same node targeted by multiple mutation kinds");
  });

  test("maps Drizzle columns with explicit conversion rules", () => {
    const id = crypto.randomUUID();
    const projectId = crypto.randomUUID();
    expect(
      nodePayload(author, {
        id,
        projectId: projectId,
        projectVersion: 2,
        createdAt: new Date("2026-07-16T10:00:00.000Z"),
        updatedAt: new Date("2026-07-16T10:01:00.123Z"),
        isDeleted: false,
        isOutdated: true,
        frontendParentIds: ["ui-parent"],
        updateType: "MANUAL",
        name: "Ada",
        bio: null,
      }),
    ).toEqual({
      nodeType: "author",
      id,
      projectId: projectId,
      projectVersion: 2,
      createdAt: "2026-07-16T10:00:00Z",
      updatedAt: "2026-07-16T10:01:00.123Z",
      isDeleted: false,
      isOutdated: true,
      frontendParentIds: ["ui-parent"],
      updateType: "manual",
      name: "Ada",
      bio: null,
    });
  });

  test("normalizes exact-second Dates recursively while preserving fractional milliseconds", () => {
    const timestampAuthor = {
      ...author,
      schemas: {
        ...author.schemas,
        response: Type.Object(
          {
            ...author.schemas.response.properties,
            bio: Type.Object(
              {
                exact: Type.String({ format: "date-time" }),
                fractional: Type.Array(Type.String({ format: "date-time" })),
              },
              { additionalProperties: false },
            ),
          },
          { additionalProperties: false },
        ),
      },
    } satisfies NodeDefinition;

    const payload = nodePayload(timestampAuthor, {
      ...commonRow(AUTHOR_ONE),
      name: "Ada",
      bio: {
        exact: new Date("2026-07-16T10:02:00.000Z"),
        fractional: [new Date("2026-07-16T10:02:00.001Z")],
      },
    });

    expect(payload.bio).toEqual({
      exact: "2026-07-16T10:02:00Z",
      fractional: ["2026-07-16T10:02:00.001Z"],
    });
  });

  test("serializes a PostgreSQL typed-array view as an ordinary response array", () => {
    const typedArrayAuthor = {
      ...author,
      schemas: {
        ...author.schemas,
        response: Type.Object(
          {
            ...author.schemas.response.properties,
            bio: Type.Array(Type.Integer()),
          },
          { additionalProperties: false },
        ),
      },
    } satisfies NodeDefinition;

    const payload = nodePayload(typedArrayAuthor, {
      ...commonRow(AUTHOR_ONE),
      name: "Ada",
      bio: new Int32Array([2, 3, 5]),
    });

    expect(payload.bio).toEqual([2, 3, 5]);
    expect(Array.isArray(payload.bio)).toBeTrue();
  });

  test("parses every typed-array view the database row type admits", () => {
    const row: NodeDatabaseRow = {
      bytes: new Uint8Array([1, 2]),
      ints: new Int32Array([2, 3, 5]),
      floats: new Float64Array([1.5]),
    };

    const [parsed] = Value.Parse(NodeDatabaseRowsSchema, [row]);

    expect(parsed?.["bytes"]).toBeInstanceOf(Uint8Array);
    expect(parsed?.["ints"]).toBeInstanceOf(Int32Array);
    expect(parsed?.["floats"]).toBeInstanceOf(Float64Array);
    expect(parsed).toEqual(row);
  });
});

describe("node mutation batching invariants", () => {
  const AUTH = { user: null, authorize: async () => Result.ok(undefined) };
  const dialect = new PgDialect();
  type MutationDatabase = Pick<
    NodeDatabase<typeof representativeSchema>,
    "delete" | "insert" | "select" | "update"
  >;

  const defineBatchingDescriptor = (database: MutationDatabase) =>
    bindNodeRuntime(
      defineNodeDescriptor<typeof representativeSchema>({
        name: "mutation-batching-test",
        auditLogEnabled: false,
        schema: representativeSchema,
        nodeMetadata: representativeNodeMetadata,
      }),
      {
        persistence: {
          query: async (callback) => callback(database),
          streamRows: emptyNodeRowStream,
          transact: async (callback) => callback(),
        },
        versionPeer: {
          validateWriteVersion: async () => Result.ok(undefined),
          resolveLatestVersion: async () => Result.ok(1),
          validateVersionLock: async () => Result.ok(undefined),
        },
      },
    );

  const insertCapturingTransaction = (
    statements: { table: AnyPgTable; rows: NodeDatabaseRow[] }[],
  ): MutationDatabase =>
    Object.assign(drizzle.mock({ schema: representativeSchema }), {
      select: () => ({
        from: () => ({ where: async () => [{ id: AUTHOR_ONE }] }),
      }),
      insert: (table: AnyPgTable) => ({
        values: (rows: NodeDatabaseRow[]) => ({
          returning: async () => {
            statements.push({ table, rows });
            return rows.toReversed().map((row) => ({
              ...Object.fromEntries(
                Object.keys(getTableColumns(table)).map((column) => [column, null]),
              ),
              projectVersion: 1,
              createdAt: new Date("2026-07-16T10:00:00Z"),
              updatedAt: new Date("2026-07-16T10:00:00Z"),
              isDeleted: false,
              isOutdated: false,
              frontendParentIds: [],
              updateType: "AUTOMATED",
              ...row,
            }));
          },
        }),
      }),
    });

  test("writes one multi-row insert per node type and shape while preserving input order", async () => {
    const statements: { table: AnyPgTable; rows: NodeDatabaseRow[] }[] = [];
    const descriptor = defineBatchingDescriptor(insertCapturingTransaction(statements));

    const { inserted } = (
      await mutateNodes(descriptor, AUTH, PROJECT_ID, 1, {
        inserts: [
          { nodeType: "author", id: AUTHOR_ONE, payload: { name: "Ada", bio: null } },
          { nodeType: "book", id: BOOK_ONE, payload: { authorId: AUTHOR_ONE, title: "First" } },
          { nodeType: "author", id: AUTHOR_TWO, payload: { name: "Grace" } },
          { nodeType: "book", id: BOOK_TWO, payload: { authorId: AUTHOR_TWO, title: "Second" } },
        ],
      })
    ).unwrap();

    expect(statements).toHaveLength(3);
    expect(statements.find(({ rows }) => rows.some(({ id }) => id === AUTHOR_ONE))?.rows).toEqual([
      expect.objectContaining({ id: AUTHOR_ONE }),
    ]);
    const bookRows = statements.find(({ table }) => table === books)?.rows;
    if (bookRows === undefined) throw new Error("book insert did not reach persistence");
    expect(bookRows).toHaveLength(2);
    expect(new Set(bookRows.map(({ id }) => id))).toEqual(new Set([BOOK_ONE, BOOK_TWO]));
    expect(statements.find(({ rows }) => rows.some(({ id }) => id === AUTHOR_TWO))?.rows).toEqual([
      expect.objectContaining({ id: AUTHOR_TWO }),
    ]);
    expect(inserted.map(({ nodeType, id }) => ({ nodeType, id }))).toEqual([
      { nodeType: "author", id: AUTHOR_ONE },
      { nodeType: "book", id: BOOK_ONE },
      { nodeType: "author", id: AUTHOR_TWO },
      { nodeType: "book", id: BOOK_TWO },
    ]);
  });

  test("rejects a write whose persisted parent is not in the project version", async () => {
    const statements: { table: AnyPgTable; rows: NodeDatabaseRow[] }[] = [];
    const descriptor = defineBatchingDescriptor(insertCapturingTransaction(statements));

    const result = await mutateNodes(descriptor, AUTH, PROJECT_ID, 1, {
      inserts: [
        {
          nodeType: "book",
          id: "50000000-0000-4000-8000-000000000001",
          payload: { authorId: AUTHOR_TWO, title: "Orphan" },
        },
      ],
    });

    expect(result.status).toBe("error");
    expect(result.isErr() && result.error.status).toBe(422);
    expect(statements).toEqual([]);
  });

  test("accepts a persisted parent inserted in the same batch", async () => {
    const statements: { table: AnyPgTable; rows: NodeDatabaseRow[] }[] = [];
    const descriptor = defineBatchingDescriptor(insertCapturingTransaction(statements));

    const result = await mutateNodes(descriptor, AUTH, PROJECT_ID, 1, {
      inserts: [
        { nodeType: "author", id: AUTHOR_TWO, payload: { name: "New author" } },
        {
          nodeType: "book",
          id: "50000000-0000-4000-8000-000000000002",
          payload: { authorId: AUTHOR_TWO, title: "Debut" },
        },
      ],
    });

    expect(result.unwrap().inserted).toHaveLength(2);
  });

  test("writes the mutation that prepareMutation returns after version admission", async () => {
    const statements: { table: AnyPgTable; rows: NodeDatabaseRow[] }[] = [];
    const calls: string[] = [];
    const runtime = defineBatchingDescriptor(insertCapturingTransaction(statements));
    const result = await mutateNodes(
      {
        ...runtime,
        versionPeer: {
          ...runtime.versionPeer,
          validateWriteVersion: async () => {
            calls.push("version");
            return Result.ok(undefined);
          },
        },
        prepareMutation: async (projectId, projectVersion, mutation) => {
          calls.push(`prepare ${projectId} ${projectVersion}`);
          return Result.ok({
            ...mutation,
            inserts: mutation.inserts.map((item) => ({
              ...item,
              payload: { ...item.payload, name: "Prepared" },
            })),
          });
        },
      },
      AUTH,
      PROJECT_ID,
      1,
      { inserts: [{ nodeType: "author", payload: { name: "Requested" } }] },
    );

    expect(calls).toEqual(["version", `prepare ${PROJECT_ID} 1`]);
    expect(result.unwrap().inserted).toEqual([expect.objectContaining({ name: "Prepared" })]);
    expect(statements.flatMap(({ rows }) => rows)).toEqual([
      expect.objectContaining({ name: "Prepared" }),
    ]);
  });

  test("rejects a prepared mutation that fails the node contract or the hook", async () => {
    const statements: { table: AnyPgTable; rows: NodeDatabaseRow[] }[] = [];
    const runtime = defineBatchingDescriptor(insertCapturingTransaction(statements));
    await expect(
      mutateNodes(
        {
          ...runtime,
          prepareMutation: async (_projectId, _projectVersion, mutation) =>
            Result.ok({
              ...mutation,
              inserts: mutation.inserts.map((item) => ({ ...item, payload: { name: 7 } })),
            }),
        },
        AUTH,
        PROJECT_ID,
        1,
        { inserts: [{ nodeType: "author", payload: { name: "Requested" } }] },
      ),
    ).rejects.toMatchObject({ status: 422 });
    const refused = await mutateNodes(
      {
        ...runtime,
        prepareMutation: async () => Result.err(NodeVersionError()),
      },
      AUTH,
      PROJECT_ID,
      1,
      { inserts: [{ nodeType: "author", payload: { name: "Requested" } }] },
    );
    expect(refused.isErr() && refused.error.status).toBe(409);
    expect(statements).toEqual([]);
  });

  test("matches persisted parents whatever the letter case of their id", async () => {
    const statements: { table: AnyPgTable; rows: NodeDatabaseRow[] }[] = [];
    const storedAuthor = "2000000a-0000-4000-8000-00000000000b";
    const descriptor = defineBatchingDescriptor(
      Object.assign(insertCapturingTransaction(statements), {
        select: () => ({ from: () => ({ where: async () => [{ id: storedAuthor }] }) }),
      }),
    );

    const result = await mutateNodes(descriptor, AUTH, PROJECT_ID, 1, {
      inserts: [
        { nodeType: "author", id: "2000000C-0000-4000-8000-00000000000D", payload: { name: "Ada" } },
        {
          nodeType: "book",
          id: "50000000-0000-4000-8000-000000000003",
          payload: { authorId: storedAuthor.toUpperCase(), title: "Stored" },
        },
        {
          nodeType: "book",
          id: "50000000-0000-4000-8000-000000000004",
          payload: { authorId: "2000000c-0000-4000-8000-00000000000d", title: "Same batch" },
        },
      ],
    });

    expect(result.unwrap().inserted).toHaveLength(3);
  });

  test("splits large same-shape inserts into statements below the PostgreSQL parameter limit", async () => {
    const statements: { table: AnyPgTable; rows: NodeDatabaseRow[] }[] = [];
    const descriptor = defineBatchingDescriptor(insertCapturingTransaction(statements));

    const { inserted } = (
      await mutateNodes(descriptor, AUTH, PROJECT_ID, 1, {
        inserts: Array.from({ length: 30_000 }, (_, index) => ({
          nodeType: "book",
          id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          payload: { authorId: AUTHOR_ONE, title: `Volume ${index + 1}` },
        })),
      })
    ).unwrap();

    expect(inserted).toHaveLength(30_000);
    for (const { rows } of statements) {
      const row = rows[0];
      if (row === undefined) throw new Error("insert statement did not contain rows");
      expect(rows.length * Object.keys(row).length).toBeLessThanOrEqual(65_535);
    }
  }, 15_000);

  test("updates 30,000 sparse rows in one set while preserving input order", async () => {
    const ids = Array.from(
      { length: 30_000 },
      (_, index) => `60000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    );
    const firstId = ids[0];
    const secondId = ids[1];
    if (firstId === undefined || secondId === undefined) {
      throw new Error("large update fixture did not contain two rows");
    }
    const updateStatements: { table: AnyPgTable; source: SQL }[] = [];
    const transaction = Object.assign(drizzle.mock({ schema: representativeSchema }), {
      update: (table: AnyPgTable) => ({
        set: (_values: NodeDatabaseRow) => ({
          from: (source: SQL) => ({
            where: (_predicate: SQL) => ({
              returning: async () => {
                updateStatements.push({ table, source });
                return ids.toReversed().map((id, index) => ({
                  ...commonRow(id),
                  name: index % 2 === 0 ? "updated" : "unchanged",
                  bio: index % 2 === 0 ? null : "updated",
                }));
              },
            }),
          }),
        }),
      }),
    });
    const descriptor = defineBatchingDescriptor(transaction);

    const { updated } = (
      await mutateNodes(descriptor, AUTH, PROJECT_ID, 1, {
        updates: ids.map((id, index) => ({
          nodeType: "author",
          id,
          payload: index % 2 === 0 ? { name: "updated" } : { bio: "updated" },
        })),
      })
    ).unwrap();

    expect(updateStatements).toHaveLength(1);
    const statement = updateStatements[0];
    if (statement === undefined) throw new Error("update did not reach its SQL boundary");
    expect(statement.table).toBe(authors);
    const params = dialect.sqlToQuery(statement.source).params;
    const [serializedRows] = Value.Parse(Type.Tuple([Type.String()]), params);
    const sourceRows = Value.Parse(NodeDatabaseRowsSchema, JSON.parse(serializedRows));
    expect(sourceRows).toHaveLength(30_000);
    expect(sourceRows[0]).toEqual({ id: firstId, name: "updated" });
    expect(sourceRows[1]).toEqual({ id: secondId, bio: "updated" });
    expect(updated).toHaveLength(30_000);
    expect(updated[0]?.id).toBe(firstId);
    expect(updated.at(-1)?.id).toBe(ids.at(-1));
  }, 15_000);

  test("collapses soft-deletes by type while preserving response order", async () => {
    const deleteStatements: { table: AnyPgTable; ids: string[] }[] = [];
    const transaction = Object.assign(drizzle.mock({ schema: representativeSchema }), {
      update: (table: AnyPgTable) => ({
        set: (values: NodeDatabaseRow) => ({
          where: (predicate: SQL) => ({
            returning: async () => {
              const ids = table === books ? [BOOK_TWO, BOOK_ONE] : [AUTHOR_ONE];
              const params = dialect.sqlToQuery(predicate).params;
              deleteStatements.push({
                table,
                ids: [AUTHOR_ONE, BOOK_ONE, BOOK_TWO].filter((id) => params.includes(id)),
              });
              return ids.map((id) =>
                table === books
                  ? {
                      ...commonRow(id),
                      authorId: AUTHOR_ONE,
                      title: "Deleted book",
                      year: null,
                      ...values,
                    }
                  : { ...commonRow(id), name: "Deleted author", bio: null, ...values },
              );
            },
          }),
        }),
      }),
    });
    const descriptor = defineBatchingDescriptor(transaction);

    const { inserted, deleted } = (
      await mutateNodes(descriptor, AUTH, PROJECT_ID, 1, {
        deletes: [
          { nodeType: "book", id: BOOK_ONE },
          { nodeType: "author", id: AUTHOR_ONE },
          { nodeType: "book", id: BOOK_TWO },
        ],
      })
    ).unwrap();

    expect(deleteStatements).toHaveLength(2);
    expect(deleteStatements.find(({ table }) => table === books)?.ids).toEqual([
      BOOK_ONE,
      BOOK_TWO,
    ]);
    expect(deleteStatements.find(({ table }) => table === authors)?.ids).toEqual([AUTHOR_ONE]);
    expect(inserted).toEqual([]);
    expect(deleted).toEqual([
      { nodeType: "book", id: BOOK_ONE },
      { nodeType: "author", id: AUTHOR_ONE },
      { nodeType: "book", id: BOOK_TWO },
    ]);
  });

  test("rejects a soft-delete batch that affected fewer rows than requested targets", async () => {
    const transaction = Object.assign(drizzle.mock({ schema: representativeSchema }), {
      update: (_table: AnyPgTable) => ({
        set: (values: NodeDatabaseRow) => ({
          where: (_predicate: SQL) => ({
            returning: async () => [{ ...commonRow(AUTHOR_ONE), ...values }],
          }),
        }),
      }),
    });
    const descriptor = defineBatchingDescriptor(transaction);

    expect(
      mutateNodes(descriptor, AUTH, PROJECT_ID, 1, {
        deletes: [
          { nodeType: "author", id: AUTHOR_ONE },
          { nodeType: "author", id: AUTHOR_TWO },
        ],
      }),
    ).rejects.toThrow("Delete batch affected fewer rows than expected");
  });
});

describe("node batch read invariants", () => {
  test("returns one row for repeated references without another persistence read", async () => {
    const calls: string[] = [];
    const descriptor = descriptorForRows(
      new Map<AnyPgTable, readonly NodeDatabaseRow[]>([
        [
          authors,
          [
            {
              ...commonRow(AUTHOR_ONE),
              name: "Ada",
              bio: null,
            },
          ],
        ],
      ]),
      calls,
    );

    const result = await batchNodes(descriptor, PROJECT_ID, 1, [
      { nodeType: "author", id: AUTHOR_ONE },
      { nodeType: "author", id: AUTHOR_ONE },
    ]);

    expect(result.results.map(({ nodeType, id }) => ({ nodeType, id }))).toEqual([
      { nodeType: "author", id: AUTHOR_ONE },
    ]);
    expect(calls).toEqual(["author"]);
  });

  test("groups by first-seen type, omits missing rows, and keeps per-group row order", async () => {
    const calls: string[] = [];
    const descriptor = descriptorForRows(
      new Map<AnyPgTable, readonly NodeDatabaseRow[]>([
        [
          books,
          [
            {
              ...commonRow(BOOK_ONE),
              authorId: AUTHOR_ONE,
              title: "First",
              year: 2025,
            },
            {
              ...commonRow(BOOK_TWO),
              authorId: AUTHOR_TWO,
              title: "Second",
              year: 2026,
            },
          ],
        ],
        [
          authors,
          [
            { ...commonRow(AUTHOR_ONE), name: "Ada", bio: null },
            { ...commonRow(AUTHOR_TWO), name: "Grace", bio: null },
          ],
        ],
      ]),
      calls,
    );

    const result = await batchNodes(descriptor, PROJECT_ID, 1, [
      { nodeType: "book", id: BOOK_TWO },
      { nodeType: "author", id: AUTHOR_TWO },
      { nodeType: "book", id: MISSING },
      { nodeType: "book", id: BOOK_ONE },
      { nodeType: "author", id: AUTHOR_ONE },
      { nodeType: "book", id: BOOK_TWO },
    ]);

    expect(result.results.map(({ nodeType, id }) => ({ nodeType, id }))).toEqual([
      { nodeType: "book", id: BOOK_ONE },
      { nodeType: "book", id: BOOK_TWO },
      { nodeType: "author", id: AUTHOR_ONE },
      { nodeType: "author", id: AUTHOR_TWO },
    ]);
    expect(calls).toEqual(["book", "author"]);
  });
});
