import { getTableColumns } from "drizzle-orm";
import type { AnyPgTable, PgColumn } from "drizzle-orm/pg-core";

import type { NodeDefinition } from "./descriptor";
import { InvalidNodeRequestError } from "./errors";

export interface ColumnBinding {
  readonly propertyKey: string;
  readonly column: PgColumn;
}

export const tableColumns = (table: AnyPgTable): Record<string, PgColumn> =>
  Object.fromEntries(
    Object.entries(getTableColumns(table)).filter(([, column]) => column.name !== "sys_period"),
  ) as Record<string, PgColumn>;

export const nodeTableColumns = (node: NodeDefinition): Record<string, PgColumn> =>
  tableColumns(node.table);

export const findColumnBinding = (
  node: NodeDefinition,
  field: string,
): ColumnBinding | undefined => {
  const matches = Object.entries(nodeTableColumns(node)).filter(
    ([propertyKey, column]) => propertyKey === field || column.name === field,
  );
  if (matches.length > 1) {
    const properties = matches
      .map(([propertyKey]) => `'${propertyKey}'`)
      .sort()
      .join(" and ");
    throw InvalidNodeRequestError({
      internal: {
        message: `Node '${node.nodeType}' table field '${field}' is ambiguous between Drizzle properties ${properties}`,
      },
    });
  }
  const match = matches[0];
  return match ? { propertyKey: match[0], column: match[1] } : undefined;
};

export const requireColumnBinding = (node: NodeDefinition, field: string): ColumnBinding => {
  const binding = findColumnBinding(node, field);
  if (!binding) {
    throw InvalidNodeRequestError({
      internal: {
        message: `Node '${node.nodeType}' table has no column '${field}'`,
      },
    });
  }
  return binding;
};
