import type { Permission } from "@spark-workflow/authentification";
import { Type, type TObject, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Result } from "better-result";
import { getTableName, is } from "drizzle-orm";
import { getTableConfig, PgTable, type AnyPgTable, type PgColumn } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-typebox";
import type { EvlogError } from "evlog";

import { findColumnBinding, requireColumnBinding, tableColumns } from "./column-binding";
import type { NodeSchema } from "./database";
import { InvalidNodeRequestError, UnknownNodeTypeError } from "./errors";
import type { NodePersistence } from "./persistence";
import type { PreparedNodeMutation } from "./service";
import type { NodeDatabaseRow, NodeDatabaseValue } from "./values";
import type { ProjectVersionPeer } from "./version-peer";

export type { NodeDatabase, NodeSchema } from "./database";
export type { NodePersistence } from "./persistence";
export type { NodeBase, NodeDatabaseRow, NodeDatabaseValue } from "./values";

export type NodeMutationAction = "create" | "update";

export interface NodeSchemaOverrides {
  readonly response?: Readonly<Record<string, TSchema>>;
  readonly insert?: Readonly<Record<string, TSchema>>;
  readonly patch?: Readonly<Record<string, TSchema>>;
}

export interface NodeFieldRule {
  readonly toDatabase?: (value: NodeDatabaseValue) => NodeDatabaseValue;
  readonly fromDatabase?: (value: NodeDatabaseValue) => NodeDatabaseValue | undefined;
  readonly create?: {
    readonly permissions: readonly Permission[];
    readonly ignoreValues?: readonly unknown[];
  };
  readonly update?: {
    readonly permissions: readonly Permission[];
    readonly ignoreValues?: readonly unknown[];
  };
}

interface NodeFieldRules {
  [field: string]: NodeFieldRule;
}

export const NODE_SYSTEM_FIELDS = [
  "id",
  "projectId",
  "projectVersion",
  "createdAt",
  "updatedAt",
  "isDeleted",
  "isOutdated",
  "frontendParentIds",
] as const;

export type NodeSystemField = (typeof NODE_SYSTEM_FIELDS)[number];

const NODE_SYSTEM_SQL_COLUMNS = [
  "id",
  "project_id",
  "project_version",
  "created_at",
  "updated_at",
  "is_deleted",
  "is_outdated",
  "frontend_parent_ids",
];

const NODE_SERVER_FIELDS = [
  "id",
  "projectId",
  "projectVersion",
  "createdAt",
  "updatedAt",
  "isDeleted",
];

export type PersistedParent = {
  readonly kind: "persisted";
  readonly field: string;
  readonly nodeType: string;
};

export type ExternalParent = {
  readonly kind: "external";
  readonly field: string;
  readonly nodeType: string;
  readonly service: string;
};

export type NodeParent = PersistedParent | ExternalParent;

export interface NodeDefinition<
  Name extends string = string,
  Table extends AnyPgTable = AnyPgTable,
> {
  readonly nodeType: Name;
  readonly table: Table;
  /** Explicit public mutation surface. Columns are resolved from `table`. */
  readonly fields: readonly string[];
  /** Explicit public server-owned response fields beyond the common system fields. */
  readonly readonlyFields?: readonly string[];
  /** Only semantics which Drizzle cannot infer belong here. */
  readonly fieldRules?: Readonly<NodeFieldRules>;
  readonly parents: readonly NodeParent[];
  readonly schemas: {
    readonly response: TObject;
    readonly insert: TObject;
    readonly patch: TObject;
  };
}

export interface NodeMetadata {
  readonly externalParents?: readonly ExternalParent[];
  readonly fieldRules?: Readonly<Record<string, NodeFieldRule>>;
  readonly nodeType?: string;
  readonly readonlyFields?: readonly string[];
  readonly schemaOverrides?: NodeSchemaOverrides;
  readonly schemas?: NodeDefinition["schemas"];
}

export interface FieldAuthorizationCheck {
  readonly action: NodeMutationAction;
  readonly nodeType: string;
  readonly field: string;
  readonly permissions: readonly Permission[];
  readonly value: unknown;
}

export interface RequestAuthorization {
  readonly user: { readonly sub: string } | null;
  authorize(
    checks: readonly {
      readonly resource: "project";
      readonly resourceId: string;
      readonly permission: Permission;
    }[],
    options?: Readonly<{ bypassRoles?: readonly ("admin" | "user" | "service")[] }>,
  ): Promise<Result<void, EvlogError>>;
}

export const trustedServiceAuthorization: RequestAuthorization = Object.freeze({
  user: null,
  authorize: async () => Result.ok(undefined),
});

export interface FieldAuthorizationRequest {
  readonly auth: RequestAuthorization;
  readonly projectId: string;
  readonly checks: readonly FieldAuthorizationCheck[];
}

export interface NodeDescriptor {
  readonly name: string;
  readonly auditLogEnabled: boolean;
  readonly nodes: readonly NodeDefinition[];
}

export interface NodeRuntime<Schema extends NodeSchema> extends NodeDescriptor {
  readonly persistence: NodePersistence<Schema>;
  readonly versionPeer: ProjectVersionPeer;
  readonly authorizeFields?: (
    request: FieldAuthorizationRequest,
  ) => Promise<Result<void, EvlogError>>;
  readonly prepareMutation?: (
    projectId: string,
    projectVersion: number,
    mutation: PreparedNodeMutation,
    auth: RequestAuthorization,
  ) => Promise<Result<PreparedNodeMutation, EvlogError>>;
  readonly validateCopy?: (input: {
    readonly projectId: string;
    readonly sourceVersion: number;
    readonly targetVersion: number;
    readonly dryRun: boolean;
    readonly nodes: readonly {
      readonly nodeType: string;
      readonly rows: readonly NodeDatabaseRow[];
    }[];
  }) => Promise<Result<void, EvlogError>>;
}

type TableKey<Schema extends NodeSchema> = Extract<keyof Schema, string>;

export interface NodeDescriptorInput<Schema extends NodeSchema> {
  readonly name: string;
  readonly auditLogEnabled: boolean;
  readonly schema: Schema;
  readonly nodeMetadata?: Partial<Record<TableKey<Schema>, NodeMetadata>>;
  readonly excludeNodes?: readonly TableKey<Schema>[];
}

export type NodeRuntimeInput<Schema extends NodeSchema> = Omit<
  NodeRuntime<Schema>,
  keyof NodeDescriptor
>;

export interface NodeContractSource {
  readonly name: string;
  readonly nodes: readonly NodeDefinition[];
}

const DateTimeSchema = Type.String({ format: "date-time" });
const UpdateTypeSchema = Type.Union([
  Type.Literal("automated"),
  Type.Literal("manual"),
  Type.Null(),
]);
const nullableString = Type.Union([Type.String(), Type.Null()]);
export const lowerCaseEnumRule = {
  toDatabase: (value: NodeDatabaseValue) =>
    Value.Parse(nullableString, value)?.toUpperCase() ?? null,
  fromDatabase: (value: NodeDatabaseValue) =>
    Value.Parse(nullableString, value)?.toLowerCase() ?? null,
} satisfies NodeFieldRule;

interface NodeSchemaProperties {
  [field: string]: TSchema;
}

const physicalProperties = (
  table: AnyPgTable,
  generated: Readonly<Record<string, TSchema>>,
): NodeSchemaProperties => {
  const result: NodeSchemaProperties = {};
  const sqlNames = new Set<string>();
  for (const [propertyKey, column] of Object.entries(tableColumns(table))) {
    const schema = generated[propertyKey];
    if (schema === undefined) {
      throw new TypeError(`Drizzle TypeBox schema is missing table property '${propertyKey}'`);
    }
    if (sqlNames.has(column.name)) {
      throw new TypeError(`Drizzle table has duplicate physical column '${column.name}'`);
    }
    sqlNames.add(column.name);
    result[propertyKey] = schema;
  }
  return result;
};

const selectedProperties = (
  properties: Readonly<Record<string, TSchema>>,
  fields: readonly string[],
): NodeSchemaProperties =>
  Object.fromEntries(
    fields.map((field) => {
      const schema = properties[field];
      if (schema === undefined) {
        throw new TypeError(`Node field '${field}' is not backed by a Drizzle column`);
      }
      return [field, schema];
    }),
  );

const nodeSchemas = (
  table: AnyPgTable,
  fields: readonly string[],
  overrides: NodeSchemaOverrides = {},
): NodeDefinition["schemas"] => {
  const response = physicalProperties(table, createSelectSchema(table).properties);
  const insert = selectedProperties(
    physicalProperties(table, createInsertSchema(table).properties),
    fields,
  );
  const patch = selectedProperties(
    physicalProperties(table, createUpdateSchema(table).properties),
    fields,
  );
  response.createdAt = DateTimeSchema;
  response.updatedAt = DateTimeSchema;
  if (response.updateType !== undefined) response.updateType = UpdateTypeSchema;
  if (insert.updateType !== undefined) insert.updateType = Type.Optional(UpdateTypeSchema);
  if (patch.updateType !== undefined) patch.updateType = Type.Optional(UpdateTypeSchema);
  return {
    response: Type.Object({ ...response, ...overrides.response }, { additionalProperties: false }),
    insert: Type.Object({ ...insert, ...overrides.insert }, { additionalProperties: false }),
    patch: Type.Object({ ...patch, ...overrides.patch }, { additionalProperties: false }),
  };
};

const nodeDefinitionFromTable = (
  table: AnyPgTable,
  metadata: NodeMetadata,
  nodeTypeForTable: (table: AnyPgTable) => string,
): NodeDefinition => {
  const columns = tableColumns(table);
  const readonlyFields = metadata.readonlyFields ?? [];
  const fields = Object.keys(columns).filter(
    (name) =>
      !NODE_SERVER_FIELDS.includes(name) &&
      !readonlyFields.includes(name),
  );
  const propertyBySql = Object.fromEntries(
    Object.entries(columns).map(([propertyKey, column]) => [column.name, propertyKey]),
  );
  const parents: PersistedParent[] = getTableConfig(table).foreignKeys.flatMap((foreignKey) => {
    const reference = foreignKey.reference();
    return reference.columns.flatMap((column, index) => {
      const field = propertyBySql[column.name];
      return field && fields.includes(field) && reference.foreignColumns[index]?.name === "id"
        ? [
            {
              kind: "persisted",
              field,
              nodeType: nodeTypeForTable(reference.foreignTable),
            },
          ]
        : [];
    });
  });
  const fieldRules: NodeFieldRules = { ...metadata.fieldRules };
  if (fields.includes("updateType") && fieldRules.updateType === undefined) {
    fieldRules.updateType = lowerCaseEnumRule;
  }
  return {
    nodeType: nodeTypeForTable(table),
    table,
    fields,
    readonlyFields,
    fieldRules,
    parents: [...parents, ...(metadata.externalParents ?? [])],
    schemas: metadata.schemas ?? nodeSchemas(table, fields, metadata.schemaOverrides),
  };
};

const assertDefinition = (node: NodeDefinition, knownTypes: ReadonlySet<string>): void => {
  if (!node.nodeType.trim()) {
    throw InvalidNodeRequestError({ internal: { message: "Node type names must not be empty" } });
  }
  for (const field of NODE_SYSTEM_FIELDS) {
    if (!findColumnBinding(node, field)) {
      throw InvalidNodeRequestError({
        internal: {
          message: `Node '${node.nodeType}' table is missing system column '${field}'`,
        },
      });
    }
  }
  const publicFields = [...node.fields, ...(node.readonlyFields ?? [])];
  if (new Set(publicFields).size !== publicFields.length) {
    throw InvalidNodeRequestError({
      internal: {
        message: `Node '${node.nodeType}' public fields must be unique`,
      },
    });
  }
  for (const field of publicFields) {
    if (!field || !findColumnBinding(node, field)) {
      throw InvalidNodeRequestError({
        internal: {
          message: `Node '${node.nodeType}' exposes unknown table field '${field}'`,
        },
      });
    }
  }
  for (const field of Object.keys(node.fieldRules ?? {})) {
    if (!publicFields.includes(field)) {
      throw InvalidNodeRequestError({
        internal: {
          message: `Node '${node.nodeType}' defines rules for non-public field '${field}'`,
        },
      });
    }
  }
  const responseFields = new Set(Object.keys(node.schemas.response.properties));
  const declaredResponseFields = new Set([...NODE_SYSTEM_FIELDS, ...publicFields]);
  for (const field of declaredResponseFields) {
    if (!responseFields.has(field)) {
      throw InvalidNodeRequestError({
        internal: {
          message: `Node '${node.nodeType}' response schema is missing public field '${field}'`,
        },
      });
    }
  }
  for (const field of responseFields) {
    if (!declaredResponseFields.has(field)) {
      throw InvalidNodeRequestError({
        internal: {
          message: `Node '${node.nodeType}' response schema exposes undeclared public field '${field}'`,
        },
      });
    }
  }
  for (const field of [
    ...Object.keys(node.schemas.insert.properties),
    ...Object.keys(node.schemas.patch.properties),
  ]) {
    if (!node.fields.includes(field)) {
      throw InvalidNodeRequestError({
        internal: {
          message: `Node '${node.nodeType}' input schema exposes non-mutable field '${field}'`,
        },
      });
    }
  }
  for (const parent of node.parents) {
    if (!node.fields.includes(parent.field)) {
      throw InvalidNodeRequestError({
        internal: {
          message: `Parent field '${node.nodeType}.${parent.field}' is not declared public`,
        },
      });
    }
    if (parent.kind === "persisted" && !knownTypes.has(parent.nodeType)) {
      throw InvalidNodeRequestError({
        internal: {
          message: `Persisted parent '${parent.nodeType}' for '${node.nodeType}' is not in this descriptor`,
        },
      });
    }
  }
};

export function defineNodeDescriptor<Schema extends NodeSchema>(
  input: NodeDescriptorInput<Schema>,
): NodeDescriptor {
  const candidates: [string, AnyPgTable][] = Object.entries(input.schema).flatMap(([key, value]) => {
    if (!is(value, PgTable)) return [];
    const columnNames = Object.values(tableColumns(value)).map(({ name }) => name);
    if (!NODE_SYSTEM_SQL_COLUMNS.every((name) => columnNames.includes(name))) return [];
    const primaryKeyColumns = getTableConfig(value).primaryKeys.flatMap(({ columns }) =>
      columns.map(({ name }) => name),
    );
    return primaryKeyColumns.includes("id") && primaryKeyColumns.includes("project_version")
      ? [[key, value]]
      : [];
  });
  const candidateKeys = new Set(candidates.map(([key]) => key));
  for (const key of [...Object.keys(input.nodeMetadata ?? {}), ...(input.excludeNodes ?? [])]) {
    if (!candidateKeys.has(key)) {
      throw InvalidNodeRequestError({
        internal: { message: `Node metadata key '${key}' is not a versioned node table` },
      });
    }
  }
  const excluded = new Set<string>(input.excludeNodes);
  const nodeTypes = new Map(
    candidates.map(([key, table]) => [
      table,
      input.nodeMetadata?.[key]?.nodeType ?? getTableName(table),
    ]),
  );
  const nodeTypeForTable = (table: AnyPgTable) => nodeTypes.get(table) ?? getTableName(table);
  const nodes = candidates.flatMap(([key, value]) =>
    !excluded.has(key)
      ? [nodeDefinitionFromTable(value, input.nodeMetadata?.[key] ?? {}, nodeTypeForTable)]
      : [],
  );
  if (nodes.length === 0) {
    throw InvalidNodeRequestError({ internal: { message: "Node schema contains no node tables" } });
  }
  const {
    schema: _schema,
    nodeMetadata: _nodeMetadata,
    excludeNodes: _excludeNodes,
    ...descriptor
  } = input;
  const names = nodes.map(({ nodeType }) => nodeType);
  const knownTypes = new Set(names);
  if (knownTypes.size !== names.length) {
    throw InvalidNodeRequestError({ internal: { message: "Node type names must be unique" } });
  }
  for (const node of nodes) assertDefinition(node, knownTypes);
  return Object.freeze({
    ...descriptor,
    nodes: Object.freeze(nodes.sort((left, right) => left.nodeType.localeCompare(right.nodeType))),
  });
}

export function bindNodeRuntime<Schema extends NodeSchema>(
  descriptor: NodeDescriptor,
  input: NodeRuntimeInput<Schema>,
): NodeRuntime<Schema> {
  return Object.freeze({ ...descriptor, ...input });
}

export function nodeColumn(node: NodeDefinition, field: string): PgColumn {
  return requireColumnBinding(node, field).column;
}

export function nodeDefinition(descriptor: NodeContractSource, nodeType: string): NodeDefinition {
  const node = descriptor.nodes.find((candidate) => candidate.nodeType === nodeType);
  if (!node) throw UnknownNodeTypeError({ internal: { nodeType: nodeType } });
  return node;
}
