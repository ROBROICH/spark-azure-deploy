import {
  and,
  asc,
  eq,
  getTableColumns,
  getTableName,
  inArray,
  sql,
  type InferSelectModel,
} from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";

import { nodeColumn, nodeDefinition, type NodeRuntime, type NodeSchema } from "./descriptor";

export type NodeTables = Record<string, AnyPgTable>;
export type NodeRow<Table extends AnyPgTable> = InferSelectModel<Table> & {
  nodeType: Table["_"]["name"];
};

function readNodeRows<Table extends AnyPgTable, Schema extends NodeSchema>(
  runtime: NodeRuntime<Schema>,
  table: Table,
  projectId: string,
  projectVersion: number,
  ids: readonly string[],
): Promise<NodeRow<Table>[]> {
  const node = nodeDefinition(
    runtime,
    runtime.nodes.find((candidate) => candidate.table === table)?.nodeType ?? getTableName(table),
  );
  const source: AnyPgTable = table;
  return runtime.persistence.query(async (database) => {
    if (ids.length === 0) return [];
    return database
      .select({
        ...getTableColumns(table),
        nodeType: sql`${getTableName(table)}`.mapWith(() => getTableName(table)),
      })
      .from(source)
      .where(
        and(
          eq(nodeColumn(node, "projectId"), projectId),
          eq(nodeColumn(node, "projectVersion"), projectVersion),
          eq(nodeColumn(node, "isDeleted"), false),
          inArray(nodeColumn(node, "id"), [...ids]),
        ),
      )
      .orderBy(asc(nodeColumn(node, "id")));
  });
}

export function createNodeBatchReader<
  Tables extends { [Key in keyof Tables]: AnyPgTable },
  Schema extends NodeSchema,
>(runtime: NodeRuntime<Schema>, tables: Tables) {
  return async <Key extends keyof Tables>(
    projectId: string,
    projectVersion: number,
    tableKey: Key,
    ids: readonly string[],
  ) => readNodeRows(runtime, tables[tableKey], projectId, projectVersion, ids);
}

export type NodeBatchReader<Tables extends { [Key in keyof Tables]: AnyPgTable }> = ReturnType<
  typeof createNodeBatchReader<Tables, NodeSchema>
>;
