import { isoInstant } from "@spark-workflow/http-host";
import { persistenceError } from "@spark-workflow/postgres-runtime";
import { recordAuditEntries, type AuditEntry } from "@spark-workflow/audit-client/persistence";
import { Value } from "@sinclair/typebox/value";
import { Result } from "better-result";
import { and, asc, count, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { EvlogError } from "evlog";

import { type ColumnBinding, requireColumnBinding } from "./column-binding";
import type {
  FieldAuthorizationCheck,
  NodeDefinition,
  NodeDatabase,
  NodeRuntime,
  NodeSchema,
  NodeMutationAction,
  RequestAuthorization,
} from "./descriptor";
import { NODE_SYSTEM_FIELDS, nodeColumn, nodeDefinition } from "./descriptor";
import {
  InvalidNodeRequestError,
  MutationBatchNotFoundError,
  MutationTargetConflictError,
} from "./errors";
import "./formats";
import {
  type NodeBase,
  type NodeJson,
  type NodeSummary,
  NodeSummarySchema,
  NodeDatabaseRowsSchema,
  NodeDatabaseValueSchema,
  type NodeDatabaseRow,
  type NodeDatabaseValue,
} from "./values";
import type { NodeStreamRow } from "./persistence";

// PostgreSQL accepts at most 65_535 bound parameters per statement; stay safely
// below that limit when splitting bulk mutations into statements.
const MAX_STATEMENT_PARAMETERS = 60_000;
const NODE_LIST_BATCH_SIZE = 2_048;
const JSON_HEADERS = { "content-type": "application/json" };

export interface NodeRefInput {
  readonly nodeType: string;
  readonly id: string;
}

export interface InsertNodeInput {
  readonly nodeType: string;
  readonly id?: string;
  readonly payload: { readonly [key: string]: NodeJson | undefined };
}

export interface PatchNodeInput {
  readonly nodeType: string;
  readonly id: string;
  readonly payload: { readonly [key: string]: NodeJson | undefined };
}

export interface NodeMutationInput {
  readonly inserts?: readonly InsertNodeInput[];
  readonly updates?: readonly PatchNodeInput[];
  readonly deletes?: readonly NodeRefInput[];
}

export interface PreparedNodeMutation {
  readonly inserts: readonly (InsertNodeInput & { readonly id: string })[];
  readonly updates: readonly PatchNodeInput[];
  readonly deletes: readonly NodeRefInput[];
}

export interface NodeMutationResult {
  inserted: NodeBase[];
  updated: NodeBase[];
  deleted: NodeRefInput[];
}

interface ExecutedNodeMutation {
  inserted: NodeBase[];
  updated: NodeBase[];
  deleted: NodeBase[];
}

type PermissionCandidate = {
  readonly action: NodeMutationAction;
  readonly node: NodeDefinition;
  readonly payload: { readonly [key: string]: NodeJson | undefined };
};

const serialize = (value: NodeDatabaseValue): NodeDatabaseValue => {
  if (value instanceof Date) {
    return isoInstant(value);
  }
  if (Array.isArray(value)) return value.map(serialize);
  if (ArrayBuffer.isView(value)) return Array.from(value, serialize);
  if (value instanceof Object) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serialize(item)]));
  }
  return value;
};

const read = (node: NodeDefinition, row: NodeDatabaseRow, field: string): NodeDatabaseValue => {
  const value = row[requireColumnBinding(node, field).propertyKey];
  if (value === undefined) {
    throw InvalidNodeRequestError({
      internal: { message: `Database row for '${node.nodeType}' is missing field '${field}'` },
    });
  }
  const converted = node.fieldRules?.[field]?.fromDatabase?.(value);
  return converted === undefined ? serialize(value) : converted;
};

const write = (node: NodeDefinition, field: string, value: NodeJson): NodeDatabaseValue => {
  const parsed = Value.Parse(NodeDatabaseValueSchema, value);
  const convert = node.fieldRules?.[field]?.toDatabase;
  return convert ? convert(parsed) : parsed;
};

const schemaError = (schema: NodeDefinition["schemas"]["insert"], value: NodeDatabaseValue) => {
  const first = Value.Errors(schema, value).First();
  return first
    ? `${first.path || "/"}: ${first.message}`
    : "value does not match the TypeBox contract";
};

const parsePayload = (
  node: NodeDefinition,
  kind: "insert" | "patch",
  value: { readonly [key: string]: NodeJson | undefined },
) => {
  const schema = node.schemas[kind];
  if (!Value.Check(schema, value)) {
    throw InvalidNodeRequestError({
      internal: {
        message: `Invalid ${kind} payload for '${node.nodeType}': ${schemaError(schema, value)}`,
      },
    });
  }
  return Value.Parse(schema, value) as { readonly [key: string]: NodeJson | undefined };
};

export function nodePayload(node: NodeDefinition, row: Readonly<NodeDatabaseRow>): NodeBase {
  const payload: NodeDatabaseRow = {};
  for (const field of new Set([
    ...NODE_SYSTEM_FIELDS,
    ...node.fields,
    ...(node.readonlyFields ?? []),
  ])) {
    payload[field] = read(node, row, field);
  }
  if (!Value.Check(node.schemas.response, payload)) {
    throw InvalidNodeRequestError({
      internal: {
        message: `Database row for '${node.nodeType}' violates its response contract: ${schemaError(
          node.schemas.response,
          payload,
        )}`,
      },
    });
  }
  return {
    ...Value.Parse(node.schemas.response, payload),
    nodeType: node.nodeType,
  };
}

export function collectFieldAuthorizationChecks(
  candidates: readonly PermissionCandidate[],
): FieldAuthorizationCheck[] {
  const checks: FieldAuthorizationCheck[] = [];
  const seen = new Set<string>();
  for (const { action, node, payload } of candidates) {
    for (const [field, value] of Object.entries(payload)) {
      const rule = node.fieldRules?.[field]?.[action];
      if (!rule || rule.permissions.length === 0) continue;
      if (rule.ignoreValues?.some((ignored) => Object.is(ignored, value))) {
        continue;
      }
      const key = `${action}\u0000${node.nodeType}\u0000${field}\u0000${[...rule.permissions]
        .sort()
        .join(",")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      checks.push({
        action,
        nodeType: node.nodeType,
        field,
        permissions: rule.permissions,
        value,
      });
    }
  }
  return checks;
}

export function assertUniqueMutationTargets(input: NodeMutationInput): void {
  const seen = new Map<string, string>();
  const visit = (kind: "insert" | "update" | "delete", ref: NodeRefInput) => {
    const key = `${ref.nodeType}\u0000${ref.id}`;
    const prior = seen.get(key);
    if (prior) {
      const message =
        prior === kind
          ? `Duplicate ${kind} target: ${ref.nodeType}:${ref.id}`
          : `Same node targeted by multiple mutation kinds: ${ref.nodeType}:${ref.id}`;
      throw MutationTargetConflictError({
        message,
        internal: { message },
      });
    }
    seen.set(key, kind);
  };
  for (const item of input.inserts ?? []) {
    if (item.id) visit("insert", { nodeType: item.nodeType, id: item.id });
  }
  for (const item of input.updates ?? []) visit("update", item);
  for (const item of input.deletes ?? []) visit("delete", item);
}

const activeScope = (node: NodeDefinition, projectId: string, projectVersion: number) =>
  and(
    eq(nodeColumn(node, "projectId"), projectId),
    eq(nodeColumn(node, "projectVersion"), projectVersion),
    eq(nodeColumn(node, "isDeleted"), false),
  );

const referencedPersistedParents = (
  writes: readonly {
    readonly node: NodeDefinition;
    readonly id: string;
    readonly payload: { readonly [key: string]: NodeJson | undefined };
  }[],
  inserted: ReadonlySet<string>,
) => {
  const referenced = new Map<string, Set<string>>();
  for (const { node, payload } of writes) {
    for (const parent of node.parents) {
      const value = payload[parent.field];
      if (parent.kind !== "persisted" || value === null || value === undefined) continue;
      const id = String(value).toLowerCase();
      if (inserted.has(`${parent.nodeType}\u0000${id}`)) continue;
      referenced.set(parent.nodeType, (referenced.get(parent.nodeType) ?? new Set()).add(id));
    }
  }
  return referenced;
};

const rowsForNode = async <Schema extends NodeSchema>(
  database: NodeDatabase<Schema>,
  node: NodeDefinition,
  projectId: string,
  projectVersion: number,
  ids?: readonly string[],
): Promise<NodeDatabaseRow[]> => {
  const scope = activeScope(node, projectId, projectVersion);
  const where = ids ? and(scope, inArray(nodeColumn(node, "id"), [...ids])) : scope;
  return Value.Parse(
    NodeDatabaseRowsSchema,
    await database
      .select()
      .from(node.table)
      .where(where)
      .orderBy(asc(nodeColumn(node, "id"))),
  );
};

const nodeListQuery = <Schema extends NodeSchema>(
  database: NodeDatabase<Schema>,
  descriptor: NodeRuntime<Schema>,
  projectId: string,
  projectVersion: number,
) => {
  const branches = descriptor.nodes.map((node, nodeOrder) => {
    const parents = node.parents.reduce(
      (array, parent) => {
        const parentId = nodeColumn(node, parent.field);
        return sql`${array} || CASE WHEN ${parentId} IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('id', ${parentId}, 'nodeType', CAST(${parent.nodeType} AS text))) END`;
      },
      sql`'[]'::jsonb`,
    );
    const id = nodeColumn(node, "id");
    return database
      .select({
        nodeOrder: sql<number>`${nodeOrder}`.as("node_order"),
        nodeId: sql<string>`CAST(${id} AS text)`.as("node_id"),
        nodeJson:
          sql<string>`CAST(json_build_object('id', ${id}, 'nodeType', CAST(${node.nodeType} AS text), 'parents', ${parents}, 'frontendParentIds', coalesce(array_to_json(${nodeColumn(node, "frontendParentIds")}), '[]'::json), 'isOutdated', ${nodeColumn(node, "isOutdated")}) AS text)`.as(
            "node_json",
          ),
      })
      .from(node.table)
      .where(activeScope(node, projectId, projectVersion));
  });
  const query = branches[0]!.$dynamic();
  for (const branch of branches.slice(1)) query.unionAll(branch);
  return query.orderBy(({ nodeOrder, nodeId }) => [asc(nodeOrder), asc(nodeId)]);
};

export async function listNodes<Schema extends NodeSchema>(
  descriptor: NodeRuntime<Schema>,
  projectId: string,
  projectVersion: number,
  requestSignal: AbortSignal,
): Promise<Response> {
  const statement = await descriptor.persistence.query(async (database) =>
    nodeListQuery(database, descriptor, projectId, projectVersion).toSQL(),
  );
  const abort = new AbortController();
  const iterator = descriptor.persistence
    .streamRows(statement, {
      batchSize: NODE_LIST_BATCH_SIZE,
      signal: abort.signal,
    })
    [Symbol.asyncIterator]();
  let finishPromise: Promise<void> | undefined;
  const finish = (cancelled = false): Promise<void> => {
    if (cancelled) abort.abort();
    if (finishPromise) return finishPromise;
    requestSignal.removeEventListener("abort", abortFromRequest);
    finishPromise = iterator.return?.(undefined).then(() => undefined) ?? Promise.resolve();
    return finishPromise;
  };
  const abortFromRequest = (): void => {
    void finish(true).catch(() => undefined);
  };
  if (requestSignal.aborted) abort.abort();
  else requestSignal.addEventListener("abort", abortFromRequest, { once: true });

  let first: IteratorResult<readonly NodeStreamRow[]>;
  try {
    first = await iterator.next();
  } catch (error) {
    await finish(true).catch(() => undefined);
    throw error;
  }
  if (first.done) {
    await finish();
    return new Response('{"nodes":[]}', { headers: JSON_HEADERS });
  }

  const encoder = new TextEncoder();
  let pending: IteratorResult<readonly NodeStreamRow[]> | undefined = first;
  let emitted = false;
  return new Response(
    new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          const result = pending ?? (await iterator.next());
          pending = undefined;
          if (result.done) {
            controller.enqueue(encoder.encode("]}"));
            controller.close();
            await finish();
            return;
          }
          const rows = result.value.map(({ node_json }) => node_json).join(",");
          controller.enqueue(encoder.encode(`${emitted ? "," : '{"nodes":['}${rows}`));
          emitted = true;
        } catch (error) {
          controller.error(error);
          await finish(true);
        }
      },
      async cancel() {
        await finish(true);
      },
    }),
    { headers: JSON_HEADERS },
  );
}

export async function listNodeSummaries<Schema extends NodeSchema>(
  descriptor: NodeRuntime<Schema>,
  projectId: string,
  projectVersion: number,
): Promise<readonly NodeSummary[]> {
  return descriptor.persistence.query(async (database) =>
    (await nodeListQuery(database, descriptor, projectId, projectVersion)).map(({ nodeJson }) =>
      Value.Parse(NodeSummarySchema, JSON.parse(nodeJson)),
    ),
  );
}

export async function batchNodes<Schema extends NodeSchema>(
  descriptor: NodeRuntime<Schema>,
  projectId: string,
  projectVersion: number,
  refs: readonly NodeRefInput[],
) {
  return descriptor.persistence.query(async (database) => {
    const grouped = new Map<string, Set<string>>();
    for (const ref of refs) {
      nodeDefinition(descriptor, ref.nodeType);
      const ids = grouped.get(ref.nodeType) ?? new Set<string>();
      ids.add(ref.id);
      grouped.set(ref.nodeType, ids);
    }
    const results: NodeBase[] = [];
    for (const [nodeType, ids] of grouped) {
      const node = nodeDefinition(descriptor, nodeType);
      for (const row of await rowsForNode(database, node, projectId, projectVersion, [...ids])) {
        results.push(nodePayload(node, row));
      }
    }
    return { results };
  });
}

export async function paginateNodes<Schema extends NodeSchema>(
  descriptor: NodeRuntime<Schema>,
  nodeType: string,
  projectId: string,
  projectVersion: number,
  limit: number,
  offset: number,
  filters: Readonly<Record<string, readonly NodeDatabaseValue[]>> = {},
) {
  const node = nodeDefinition(descriptor, nodeType);
  return descriptor.persistence.query(async (database) => {
    const where = and(
      activeScope(node, projectId, projectVersion),
      ...Object.entries(filters).map(([field, values]) => {
        const column = nodeColumn(node, field);
        const nonNull = values.filter((value) => value !== null);
        if (nonNull.length === 0) return isNull(column);
        const valuesPredicate =
          nonNull.length === 1 ? eq(column, nonNull[0]) : inArray(column, nonNull);
        return nonNull.length === values.length
          ? valuesPredicate
          : or(isNull(column), valuesPredicate);
      }),
    );
    const rows = Value.Parse(
      NodeDatabaseRowsSchema,
      await database
        .select()
        .from(node.table)
        .where(where)
        .orderBy(asc(nodeColumn(node, "id")))
        .limit(limit)
        .offset(offset),
    );
    const totals = await database.select({ total: count() }).from(node.table).where(where);
    return {
      items: rows.slice(0, limit).map((row) => nodePayload(node, row)),
      total: totals[0]?.total ?? 0,
    };
  });
}

const mappedPayload = (
  node: NodeDefinition,
  payload: { readonly [key: string]: NodeJson | undefined },
): NodeDatabaseRow =>
  Object.fromEntries(
    Object.entries(payload).flatMap(([field, value]) => {
      if (value === undefined) return [];
      if (!node.fields.includes(field)) {
        throw InvalidNodeRequestError({
          internal: {
            message: `Unknown or read-only field '${node.nodeType}.${field}'`,
          },
        });
      }
      return [[requireColumnBinding(node, field).propertyKey, write(node, field, value)]];
    }),
  );

const mappedValues = (node: NodeDefinition, values: Readonly<NodeDatabaseRow>): NodeDatabaseRow =>
  Object.fromEntries(
    Object.entries(values).map(([field, value]) => [
      requireColumnBinding(node, field).propertyKey,
      value,
    ]),
  );

type MutationOperation = "Insert" | "Update" | "Delete";

const mutationBatchNotFound = (operation: MutationOperation) =>
  MutationBatchNotFoundError({
    message: `${operation} batch affected fewer rows than expected`,
    internal: { operation },
  });

function assignMutationResults(
  target: (NodeBase | null)[],
  items: readonly { index: number; id: string }[],
  node: NodeDefinition,
  rows: readonly NodeDatabaseRow[],
  operation: MutationOperation,
): void {
  if (rows.length !== items.length) throw mutationBatchNotFound(operation);
  const byId = new Map(
    rows.map((row) => {
      const payload = nodePayload(node, row);
      return [payload.id, payload];
    }),
  );
  for (const { index, id } of items) {
    const payload = byId.get(id);
    if (payload === undefined) throw mutationBatchNotFound(operation);
    target[index] = payload;
  }
}

const completedMutationResults = (
  values: readonly (NodeBase | null)[],
  operation: MutationOperation,
): NodeBase[] =>
  values.map((value) => {
    if (value === null) throw mutationBatchNotFound(operation);
    return value;
  });

const parsedMutation = <Schema extends NodeSchema>(
  descriptor: NodeRuntime<Schema>,
  mutation: PreparedNodeMutation,
) => {
  const inserts = mutation.inserts.map((item) => {
    const node = nodeDefinition(descriptor, item.nodeType);
    return { ...item, node, payload: parsePayload(node, "insert", item.payload) };
  });
  const updates = mutation.updates
    .map((item) => {
      const node = nodeDefinition(descriptor, item.nodeType);
      return { ...item, node, payload: parsePayload(node, "patch", item.payload) };
    })
    .filter(({ payload }) => Object.keys(payload).length > 0);
  const deletes = mutation.deletes;
  for (const item of deletes) {
    nodeDefinition(descriptor, item.nodeType);
  }
  assertUniqueMutationTargets({ inserts, updates, deletes });
  return { inserts, updates, deletes };
};

async function runNodeMutation<Schema extends NodeSchema>(
  descriptor: NodeRuntime<Schema>,
  auth: RequestAuthorization,
  projectId: string,
  projectVersion: number,
  input: NodeMutationInput,
  execute: (
    callback: () => Promise<Result<ExecutedNodeMutation, EvlogError>>,
  ) => Promise<Result<ExecutedNodeMutation, EvlogError>>,
) {
  const requested = parsedMutation(descriptor, {
    inserts: (input.inserts ?? []).map((item) => ({
      ...item,
      id: item.id ?? crypto.randomUUID(),
    })),
    updates: input.updates ?? [],
    deletes: input.deletes ?? [],
  });
  if (
    requested.inserts.length === 0 &&
    requested.updates.length === 0 &&
    requested.deletes.length === 0
  ) {
    return Result.ok({ inserted: [], updated: [], deleted: [] });
  }
  if (descriptor.authorizeFields) {
    const authorization = await descriptor.authorizeFields({
      auth,
      projectId,
      checks: collectFieldAuthorizationChecks([
        ...requested.inserts.map(
          ({ node, payload }) =>
            ({
              action: "create",
              node,
              payload,
            }) satisfies PermissionCandidate,
        ),
        ...requested.updates.map(
          ({ node, payload }) =>
            ({
              action: "update",
              node,
              payload,
            }) satisfies PermissionCandidate,
        ),
      ]),
    });
    if (authorization.isErr()) return authorization;
  }

  return execute(async () => {
    const version = await descriptor.versionPeer.validateWriteVersion(projectId, projectVersion);
    if (version.isErr()) return version;
    const prepared = await descriptor.prepareMutation?.(projectId, projectVersion, requested, auth);
    if (prepared?.isErr()) return prepared;
    const { inserts, updates, deletes } = prepared?.isOk()
      ? parsedMutation(descriptor, prepared.value)
      : requested;
    const referenced = referencedPersistedParents(
      [...inserts, ...updates],
      new Set(inserts.map(({ node, id }) => `${node.nodeType}\u0000${id.toLowerCase()}`)),
    );
    return descriptor.persistence.query(async (database) => {
      for (const [nodeType, ids] of referenced) {
        const parent = nodeDefinition(descriptor, nodeType);
        const idColumn = nodeColumn(parent, "id");
        const requested = [...ids];
        const present = new Set<string>();
        for (let offset = 0; offset < requested.length; offset += MAX_STATEMENT_PARAMETERS) {
          const rows = await database
            .select({ id: idColumn })
            .from(parent.table)
            .where(
              and(
                eq(nodeColumn(parent, "projectId"), projectId),
                eq(nodeColumn(parent, "projectVersion"), projectVersion),
                inArray(idColumn, requested.slice(offset, offset + MAX_STATEMENT_PARAMETERS)),
              ),
            );
          for (const row of rows) present.add(String(row.id).toLowerCase());
        }
        const missing = requested.find((id) => !present.has(id));
        if (missing !== undefined) {
          return Result.err(
            InvalidNodeRequestError({
              message: `Unknown ${nodeType} ${missing} in project version ${projectVersion}`,
              internal: { projectId, projectVersion, nodeType, id: missing },
            }),
          );
        }
      }
      const now = new Date();

      const insertedResults = Array.from<NodeBase | null>({ length: inserts.length }).fill(null);
      const insertGroups = new Map<
        string,
        {
          node: NodeDefinition;
          columns: string[];
          items: { index: number; id: string; values: NodeDatabaseRow }[];
        }
      >();
      inserts.forEach((item, index) => {
        const values: NodeDatabaseRow = {
          ...mappedValues(item.node, {
            id: item.id,
            projectId,
            projectVersion,
            createdAt: now,
            updatedAt: now,
            isDeleted: false,
          }),
          ...mappedPayload(item.node, item.payload),
        };
        const sortedEntries = Object.entries(values).sort(([a], [b]) =>
          a < b ? -1 : a > b ? 1 : 0,
        );
        const orderedValues: NodeDatabaseRow = Object.fromEntries(sortedEntries);
        const columns = sortedEntries.map(([column]) => column);
        const groupKey = `${item.node.nodeType}\u0000${columns.join("\u0000")}`;
        const group = insertGroups.get(groupKey) ?? { node: item.node, columns, items: [] };
        group.items.push({ index, id: item.id, values: orderedValues });
        insertGroups.set(groupKey, group);
      });
      for (const { node, columns, items } of insertGroups.values()) {
        const chunkSize = Math.max(1, Math.floor(MAX_STATEMENT_PARAMETERS / columns.length));
        for (let offset = 0; offset < items.length; offset += chunkSize) {
          const chunk = items.slice(offset, offset + chunkSize);
          const rows = Value.Parse(
            NodeDatabaseRowsSchema,
            await database
              .insert(node.table)
              .values(chunk.map(({ values }) => values))
              .returning(),
          );
          assignMutationResults(insertedResults, chunk, node, rows, "Insert");
        }
      }
      const inserted = completedMutationResults(insertedResults, "Insert");

      const updatedResults = Array.from<NodeBase | null>({ length: updates.length }).fill(null);
      const updateGroups = new Map<
        string,
        {
          node: NodeDefinition;
          columns: Map<string, ColumnBinding>;
          items: { index: number; id: string; values: NodeDatabaseRow }[];
        }
      >();
      updates.forEach((item, index) => {
        const group = updateGroups.get(item.node.nodeType) ?? {
          node: item.node,
          columns: new Map<string, ColumnBinding>(),
          items: [],
        };
        const values = Object.fromEntries(
          Object.entries(mappedPayload(item.node, item.payload)).map(([propertyKey, value]) => {
            const binding = requireColumnBinding(item.node, propertyKey);
            group.columns.set(propertyKey, binding);
            return [binding.column.name, value];
          }),
        );
        const id = requireColumnBinding(item.node, "id").column.name;
        group.items.push({ index, id: item.id, values: { [id]: item.id, ...values } });
        updateGroups.set(item.node.nodeType, group);
      });
      for (const { node, columns, items } of updateGroups.values()) {
        const jsonAlias = sql.identifier("node_update_json");
        const inputAlias = sql.identifier("node_update_input");
        const jsonValue = sql`${jsonAlias}.${sql.identifier("value")}`;
        const input = sql`jsonb_array_elements(${JSON.stringify(items.map(({ values }) => values))}::jsonb) as ${jsonAlias}(${sql.identifier("value")}) cross join lateral jsonb_populate_record(null::${node.table}, ${jsonValue}) as ${inputAlias}`;
        const assignments = Object.fromEntries(
          [...columns.values()].map(({ propertyKey, column }) => [
            propertyKey,
            sql`case when ${jsonValue} ? ${column.name} then ${inputAlias}.${sql.identifier(column.name)} else ${column} end`,
          ]),
        );
        const rows = Value.Parse(
          NodeDatabaseRowsSchema,
          await database
            .update(node.table)
            .set({ ...assignments, ...mappedValues(node, { updatedAt: now }) })
            .from(input)
            .where(
              and(
                activeScope(node, projectId, projectVersion),
                eq(
                  nodeColumn(node, "id"),
                  sql`${inputAlias}.${sql.identifier(nodeColumn(node, "id").name)}`,
                ),
              ),
            )
            .returning(),
        );
        assignMutationResults(updatedResults, items, node, rows, "Update");
      }
      const updated = completedMutationResults(updatedResults, "Update");

      const deletedResults = Array.from<NodeBase | null>({ length: deletes.length }).fill(null);
      const deleteGroups = new Map<
        string,
        { node: NodeDefinition; items: { index: number; id: string }[] }
      >();
      deletes.forEach((item, index) => {
        const group = deleteGroups.get(item.nodeType) ?? {
          node: nodeDefinition(descriptor, item.nodeType),
          items: [],
        };
        group.items.push({ index, id: item.id });
        deleteGroups.set(item.nodeType, group);
      });
      for (const { node, items } of deleteGroups.values()) {
        for (let offset = 0; offset < items.length; offset += MAX_STATEMENT_PARAMETERS) {
          const chunk = items.slice(offset, offset + MAX_STATEMENT_PARAMETERS);
          const rows = Value.Parse(
            NodeDatabaseRowsSchema,
            await database
              .update(node.table)
              .set(mappedValues(node, { isDeleted: true, updatedAt: now }))
              .where(
                and(
                  activeScope(node, projectId, projectVersion),
                  inArray(
                    nodeColumn(node, "id"),
                    chunk.map(({ id }) => id),
                  ),
                ),
              )
              .returning(),
          );
          assignMutationResults(deletedResults, chunk, node, rows, "Delete");
        }
      }
      const deleted = completedMutationResults(deletedResults, "Delete");
      if (descriptor.auditLogEnabled) {
        await recordAuditEntries(database, {
          projectId,
          entries: [
            ...inserts.map(
              ({ node, id }) =>
                ({
                  entityType: node.nodeType,
                  entityId: id,
                  changeType: "create",
                }) satisfies AuditEntry,
            ),
            ...updates.map(
              ({ node, id }) =>
                ({
                  entityType: node.nodeType,
                  entityId: id,
                  changeType: "update",
                }) satisfies AuditEntry,
            ),
            ...deletes.map(
              ({ nodeType, id }) =>
                ({
                  entityType: nodeType,
                  entityId: id,
                  changeType: "delete",
                }) satisfies AuditEntry,
            ),
          ],
          includeRequestContext: false,
        });
      }
      return Result.ok({ inserted, updated, deleted });
    });
  });
}

export async function executeNodeMutation<Schema extends NodeSchema>(
  descriptor: NodeRuntime<Schema>,
  auth: RequestAuthorization,
  projectId: string,
  projectVersion: number,
  input: NodeMutationInput,
) {
  try {
    return await runNodeMutation(descriptor, auth, projectId, projectVersion, input, (callback) =>
      callback(),
    );
  } catch (cause) {
    return Result.err(persistenceError(cause));
  }
}

export async function mutateNodes<Schema extends NodeSchema>(
  descriptor: NodeRuntime<Schema>,
  auth: RequestAuthorization,
  projectId: string,
  projectVersion: number,
  input: NodeMutationInput,
) {
  const result = await transactNodeMutation(descriptor, auth, projectId, projectVersion, input);
  if (result.isErr()) return result;
  return Result.ok({
    inserted: result.value.inserted,
    updated: result.value.updated,
    deleted: result.value.deleted.map(({ nodeType, id }) => ({ nodeType, id })),
  });
}

export async function transactNodeMutation<Schema extends NodeSchema>(
  descriptor: NodeRuntime<Schema>,
  auth: RequestAuthorization,
  projectId: string,
  projectVersion: number,
  input: NodeMutationInput,
) {
  return runNodeMutation(descriptor, auth, projectId, projectVersion, input, (callback) =>
    descriptor.persistence.transact(callback),
  );
}
