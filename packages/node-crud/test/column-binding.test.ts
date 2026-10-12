import { describe, expect, test } from "bun:test";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Result } from "better-result";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import {
  batchNodes,
  bindNodeRuntime,
  copyProjectVersionNodes,
  defineNodeDescriptor,
  mutateNodes,
  NodeDatabaseRowsSchema,
  undoProjectVersionNodes,
  type FieldAuthorizationRequest,
  type NodeDatabaseRow,
  type NodeDatabaseValue,
} from "../src";
import {
  ambiguousNodeMetadata,
  ambiguousSchema,
  camelNodeMetadata,
  camelSchema,
  type CamelSchema,
} from "./fixtures/camel-key/schema";
import { emptyNodeRowStream } from "./support/persistence";

const PROJECT_ID = "10000000-0000-4000-8000-000000000001";
const PARENT_ID = "parent-from-another-service";
const INSERT_ID = "20000000-0000-4000-8000-000000000001";
const UPDATE_ID = "20000000-0000-4000-8000-000000000002";
const DELETE_ID = "20000000-0000-4000-8000-000000000003";
const CREATED_AT = new Date("2026-07-17T08:00:00.000Z");
const UPDATED_AT = new Date("2026-07-17T08:01:00.000Z");

type Row = NodeDatabaseRow;
type DrizzlePredicate = SQL | undefined;
const dialect = new PgDialect();

const camelRow = (id: string, overrides: Row = {}): Row => ({
  id,
  projectId: PROJECT_ID,
  projectVersion: 1,
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  isDeleted: false,
  isOutdated: false,
  frontendParentIds: ["ui-parent"],
  displayName: "Original",
  externalParentId: PARENT_ID,
  identityNote: "identity-key",
  statusCode: "READY",
  serverNote: "server-owned",
  sysPeriod: "database-generated",
  ...overrides,
});

const defineCamelDescriptor = <Database>(
  persistence: {
    readonly query: <Result>(callback: (database: Database) => Promise<Result>) => Promise<Result>;
    readonly transact: <Result>(callback: () => Promise<Result>) => Promise<Result>;
  },
  authorizeFields = async (_request: FieldAuthorizationRequest) => Result.ok(undefined),
) =>
  bindNodeRuntime(
    defineNodeDescriptor<CamelSchema>({
      name: "camel-key-test",
      auditLogEnabled: false,
      schema: camelSchema,
      nodeMetadata: camelNodeMetadata,
    }),
    {
      persistence: {
        query: (callback) => persistence.query((database) => callback(database as never)),
        streamRows: emptyNodeRowStream,
        transact: persistence.transact,
      },
      versionPeer: {
        validateWriteVersion: async () => Result.ok(undefined),
        resolveLatestVersion: async () => Result.ok(1),
        validateVersionLock: async () => Result.ok(undefined),
      },
      authorizeFields,
    },
  );

const defineAmbiguousNode = () =>
  defineNodeDescriptor({
    name: "binding-definition-test",
    auditLogEnabled: false,
    schema: ambiguousSchema,
    nodeMetadata: ambiguousNodeMetadata,
  });

describe("Drizzle property/physical column binding", () => {
  test("accepts key or physical-name matches once and rejects distinct ambiguity early", () => {
    expect(() =>
      defineNodeDescriptor({
        name: "camel-key-definition-test",
        auditLogEnabled: false,
        schema: camelSchema,
        nodeMetadata: camelNodeMetadata,
      }),
    ).not.toThrow();
    expect(defineAmbiguousNode).toThrow("Invalid node request");
  });

  test("queries actual columns and projects camel rows into the camelCase read contract", async () => {
    const predicates: DrizzlePredicate[] = [];
    const orderings: SQL[] = [];
    const database = {
      select: () => ({
        from: () => ({
          where: (predicate: DrizzlePredicate) => {
            predicates.push(predicate);
            return {
              orderBy: async (ordering: SQL) => {
                orderings.push(ordering);
                return [camelRow(INSERT_ID)];
              },
            };
          },
        }),
      }),
    };
    const descriptor = defineCamelDescriptor({
      query: async (callback) => callback(database),
      transact: async () => {
        throw new Error("reads must not open a transaction");
      },
    });

    const batched = await batchNodes(descriptor, PROJECT_ID, 1, [
      { nodeType: "camel_node", id: INSERT_ID },
    ]);

    expect(batched).toEqual({
      results: [
        {
          nodeType: "camel_node",
          id: INSERT_ID,
          projectId: PROJECT_ID,
          projectVersion: 1,
          createdAt: "2026-07-17T08:00:00Z",
          updatedAt: "2026-07-17T08:01:00Z",
          isDeleted: false,
          isOutdated: false,
          frontendParentIds: ["ui-parent"],
          displayName: "Original",
          externalParentId: PARENT_ID,
          identityNote: "identity-key",
          statusCode: "ready",
          serverNote: "server-owned",
        },
      ],
    });

    expect(predicates).toHaveLength(1);
    expect(orderings).toHaveLength(1);
    const predicate = predicates[0];
    const ordering = orderings[0];
    if (predicate === undefined || ordering === undefined) {
      throw new Error("read query did not reach its SQL boundary");
    }
    const compiledPredicate = dialect.sqlToQuery(predicate);
    expect(compiledPredicate.sql).toContain('"project_id"');
    expect(compiledPredicate.sql).toContain('"project_version"');
    expect(compiledPredicate.sql).toContain('"is_deleted"');
    expect(compiledPredicate.sql).toContain('"id"');
    expect(dialect.sqlToQuery(ordering).sql).toContain('"id"');
  });

  test("maps insert, patch, and soft-delete values to Drizzle property keys", async () => {
    const insertedValues: Row[] = [];
    const updatedValues: Record<string, NodeDatabaseValue | SQL>[] = [];
    const updateSources: SQL[] = [];
    const updatePredicates: DrizzlePredicate[] = [];
    const authorizationRequests: FieldAuthorizationRequest[] = [];
    const transaction = {
      insert: () => ({
        values: (rows: Row[]) => ({
          returning: async () => {
            insertedValues.push(...rows);
            return rows.map((row) =>
              camelRow(`${row.id}`, {
                ...row,
                serverNote: "inserted-server-note",
              }),
            );
          },
        }),
      }),
      update: () => ({
        set: (values: Record<string, NodeDatabaseValue | SQL>) => {
          updatedValues.push(values);
          return {
            from: (source: SQL) => ({
              where: (predicate: DrizzlePredicate) => ({
                returning: async () => {
                  updateSources.push(source);
                  updatePredicates.push(predicate);
                  return [
                    camelRow(UPDATE_ID, {
                      displayName: "Updated",
                      statusCode: "QUEUED",
                    }),
                  ];
                },
              }),
            }),
            where: (predicate: DrizzlePredicate) => ({
              returning: async () => {
                updatePredicates.push(predicate);
                return [camelRow(DELETE_ID, { isDeleted: true })];
              },
            }),
          };
        },
      }),
    };
    const descriptor = defineCamelDescriptor(
      {
        query: async (callback) => callback(transaction),
        transact: async (callback) => callback(),
      },
      async (request) => {
        authorizationRequests.push(request);
        return Result.ok(undefined);
      },
    );

    const result = await mutateNodes(
      descriptor,
      { user: null, authorize: async () => Result.ok(undefined) },
      PROJECT_ID,
      1,
      {
        inserts: [
          {
            nodeType: "camel_node",
            id: INSERT_ID,
            payload: {
              displayName: "Inserted",
              externalParentId: PARENT_ID,
              identityNote: "insert identity",
              statusCode: "ready",
              isOutdated: false,
              frontendParentIds: ["insert-parent"],
            },
          },
        ],
        updates: [
          {
            nodeType: "camel_node",
            id: UPDATE_ID,
            payload: { displayName: "Updated", statusCode: "queued" },
          },
        ],
        deletes: [{ nodeType: "camel_node", id: DELETE_ID }],
      },
    );

    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      id: INSERT_ID,
      projectId: PROJECT_ID,
      projectVersion: 1,
      isDeleted: false,
      displayName: "Inserted",
      externalParentId: PARENT_ID,
      identityNote: "insert identity",
      statusCode: "READY",
      isOutdated: false,
      frontendParentIds: ["insert-parent"],
    });
    expect(insertedValues[0]!.createdAt).toBeInstanceOf(Date);
    expect(insertedValues[0]!.updatedAt).toBe(insertedValues[0]!.createdAt);
    expect(insertedValues[0]).not.toHaveProperty("project_id");
    expect(insertedValues[0]).not.toHaveProperty("display_name");

    expect(updatedValues).toHaveLength(2);
    const patchValues = updatedValues[0];
    const deleteValues = updatedValues[1];
    const updateSource = updateSources[0];
    if (patchValues === undefined || deleteValues === undefined || updateSource === undefined) {
      throw new Error("mutation did not reach its SQL boundary");
    }
    expect(patchValues).toHaveProperty("displayName");
    expect(patchValues).toHaveProperty("statusCode");
    expect(patchValues.updatedAt).toBeInstanceOf(Date);
    expect(patchValues).not.toHaveProperty("display_name");
    expect(patchValues).not.toHaveProperty("updated_at");
    expect(updateSources).toHaveLength(1);
    const sourceParams = dialect.sqlToQuery(updateSource).params;
    const [serializedRows] = Value.Parse(Type.Tuple([Type.String()]), sourceParams);
    expect(Value.Parse(NodeDatabaseRowsSchema, JSON.parse(serializedRows))).toEqual([
      { id: UPDATE_ID, display_name: "Updated", status_code: "QUEUED" },
    ]);
    expect(deleteValues).toMatchObject({ isDeleted: true });
    expect(deleteValues.updatedAt).toBeInstanceOf(Date);
    expect(deleteValues).not.toHaveProperty("is_deleted");

    for (const predicate of updatePredicates) {
      if (predicate === undefined) throw new Error("mutation did not reach its SQL boundary");
      const compiled = dialect.sqlToQuery(predicate);
      expect(compiled.sql).toContain('"project_id"');
      expect(compiled.sql).toContain('"project_version"');
      expect(compiled.sql).toContain('"is_deleted"');
      expect(compiled.sql).toContain('"id"');
    }
    expect(authorizationRequests).toHaveLength(1);
    expect(
      authorizationRequests[0]!.checks.map(({ action, field }) => ({ action, field })),
    ).toEqual([
      { action: "create", field: "displayName" },
      { action: "create", field: "statusCode" },
      { action: "update", field: "displayName" },
      { action: "update", field: "statusCode" },
    ]);
    expect(result.unwrap().inserted[0]).toMatchObject({
      nodeType: "camel_node",
      id: INSERT_ID,
      projectId: PROJECT_ID,
      displayName: "Inserted",
      statusCode: "ready",
      serverNote: "inserted-server-note",
    });
    expect(result.unwrap().updated[0]).toMatchObject({
      nodeType: "camel_node",
      id: UPDATE_ID,
      projectId: PROJECT_ID,
      displayName: "Updated",
      statusCode: "queued",
    });
    expect(result.unwrap().deleted).toEqual([{ nodeType: "camel_node", id: DELETE_ID }]);
  });

  test("maps version-copy sources, specials, overrides, and undo predicates through one binding", async () => {
    const copyIds = [
      INSERT_ID,
      ...Array.from(
        { length: 500 },
        (_, index) => `29000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      ),
    ];
    const sourceRows = copyIds.map((id) =>
      camelRow(
        id,
        id === INSERT_ID
          ? {
              identityNote: "copied unchanged",
              statusCode: "READY",
              sysPeriod: "must-not-copy",
            }
          : {},
      ),
    );
    const selectRows: Row[][] = [sourceRows, []];
    const insertedBatches: Row[][] = [];
    const deletePredicates: DrizzlePredicate[] = [];
    const transaction = {
      select: () => ({
        from: () => ({
          where: () => ({
            orderBy: async () => selectRows.shift() ?? [],
          }),
        }),
      }),
      insert: () => ({
        values: (values: Row[]) => ({
          returning: async () => {
            insertedBatches.push(values);
            return values;
          },
        }),
      }),
      delete: () => ({
        where: (predicate: DrizzlePredicate) => ({
          returning: async () => {
            deletePredicates.push(predicate);
            return [sourceRows[0]!];
          },
        }),
      }),
    };
    const descriptor = defineCamelDescriptor({
      query: async (callback) => callback(transaction),
      transact: async (callback) => callback(),
    });

    const copy = await copyProjectVersionNodes({
      descriptor,
      projectId: PROJECT_ID,
      sourceVersion: 1,
      targetVersion: 2,
      lockToken: "lock-token",
      nodes: copyIds.map((id) =>
        id === INSERT_ID
          ? {
              nodeType: "camel_node",
              id,
              setOutdated: true,
              overrides: { displayName: "Copied", statusCode: "queued" },
            }
          : { nodeType: "camel_node", id },
      ),
      dryRun: false,
    });
    expect(copy.isOk()).toBeTrue();
    if (copy.isOk()) expect(copy.value).toEqual({ copied: 501 });

    expect(insertedBatches.map(({ length }) => length)).toEqual([500, 1]);
    const copied = insertedBatches.flat().find(({ id }) => id === INSERT_ID)!;
    expect(copied).toMatchObject({
      id: INSERT_ID,
      projectId: PROJECT_ID,
      projectVersion: 2,
      isDeleted: false,
      isOutdated: true,
      frontendParentIds: ["ui-parent"],
      displayName: "Copied",
      externalParentId: PARENT_ID,
      identityNote: "copied unchanged",
      statusCode: "QUEUED",
      serverNote: "server-owned",
    });
    expect(copied.createdAt).toBeInstanceOf(Date);
    expect(copied.updatedAt).toBe(copied.createdAt);
    expect(copied).not.toHaveProperty("sysPeriod");
    expect(copied).not.toHaveProperty("project_id");
    expect(copied).not.toHaveProperty("display_name");

    expect(
      await undoProjectVersionNodes({
        descriptor,
        projectId: PROJECT_ID,
        targetVersion: 2,
        lockToken: "lock-token",
      }),
    ).toEqual({ deleted: { camel_node: 1 } });
    expect(deletePredicates).toHaveLength(1);
    const deletePredicate = deletePredicates[0];
    if (deletePredicate === undefined) throw new Error("delete did not reach its SQL boundary");
    const compiledDelete = dialect.sqlToQuery(deletePredicate);
    expect(compiledDelete.sql).toContain('"project_id"');
    expect(compiledDelete.sql).toContain('"project_version"');
  });
});
