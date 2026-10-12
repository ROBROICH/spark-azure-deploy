import { Type } from "@sinclair/typebox";
import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { defineNodeDescriptor, type NodeFieldRule } from "../../../src";

const camelSystemColumns = () => ({
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  projectVersion: integer("project_version").notNull(),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  isOutdated: boolean("is_outdated").notNull().default(false),
  frontendParentIds: varchar("frontend_parent_ids").array().notNull().default([]),
});

export const camelNodesTable = pgTable(
  "camel_node",
  {
    ...camelSystemColumns(),
    displayName: varchar("display_name").notNull(),
    externalParentId: varchar("external_parent_id").notNull(),
    identityNote: text("identity_note").notNull(),
    statusCode: varchar("status_code").notNull(),
    serverNote: text("server_note").notNull(),
    sysPeriod: text("sys_period"),
  },
  (table) => [primaryKey({ columns: [table.id, table.projectVersion] })],
);

const response = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    projectId: Type.String({ format: "uuid" }),
    projectVersion: Type.Integer({ minimum: 1 }),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
    isDeleted: Type.Boolean(),
    isOutdated: Type.Boolean(),
    frontendParentIds: Type.Array(Type.String()),
    displayName: Type.String(),
    externalParentId: Type.String({ minLength: 1 }),
    identityNote: Type.String(),
    statusCode: Type.Union([Type.Literal("ready"), Type.Literal("queued")]),
    serverNote: Type.String(),
  },
  { additionalProperties: false },
);

const insert = Type.Object(
  {
    displayName: Type.String(),
    externalParentId: Type.String({ minLength: 1 }),
    identityNote: Type.String(),
    statusCode: Type.Union([Type.Literal("ready"), Type.Literal("queued")]),
    isOutdated: Type.Optional(Type.Boolean()),
    frontendParentIds: Type.Optional(Type.Array(Type.String())),
  },
  { additionalProperties: false },
);

const statusCodeRule: NodeFieldRule = {
  toDatabase: (value) => (value === null ? value : `${value}`.toUpperCase()),
  fromDatabase: (value) => (value === null ? value : `${value}`.toLowerCase()),
  create: { permissions: ["create"] },
  update: { permissions: ["update"] },
};

export const camelSchema = { camelNodesTable };
export type CamelSchema = typeof camelSchema;
export const camelNodeMetadata = {
  camelNodesTable: {
    externalParents: [
      {
        kind: "external",
        field: "externalParentId",
        nodeType: "external_parent",
        service: "external_parent_service",
      },
    ],
    fieldRules: {
      displayName: {
        create: { permissions: ["create"] },
        update: { permissions: ["update"] },
      },
      statusCode: statusCodeRule,
    },
    readonlyFields: ["serverNote"],
    schemas: {
      response,
      insert,
      patch: Type.Partial(insert),
    },
  },
} as const;

export const camelNode = defineNodeDescriptor({
  name: "camel-key-fixture",
  auditLogEnabled: false,
  schema: camelSchema,
  nodeMetadata: camelNodeMetadata,
}).nodes[0]!;

export const ambiguousTable = pgTable(
  "ambiguous_node",
  {
    ...camelSystemColumns(),
    apiField: text("ambiguous_api").notNull(),
    ambiguous_api: text("different_physical").notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.projectVersion] })],
);

const ambiguousResponse = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    projectId: Type.String({ format: "uuid" }),
    projectVersion: Type.Integer({ minimum: 1 }),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
    isDeleted: Type.Boolean(),
    isOutdated: Type.Boolean(),
    frontendParentIds: Type.Array(Type.String()),
    ambiguous_api: Type.String(),
    different_physical: Type.String(),
  },
  { additionalProperties: false },
);

export const ambiguousSchema = { ambiguousTable };
export const ambiguousNodeMetadata = {
  ambiguousTable: {
    schemas: {
      response: ambiguousResponse,
      insert: Type.Object(
        { ambiguous_api: Type.String(), different_physical: Type.String() },
        { additionalProperties: false },
      ),
      patch: Type.Partial(
        Type.Object(
          { ambiguous_api: Type.String(), different_physical: Type.String() },
          { additionalProperties: false },
        ),
      ),
    },
  },
} as const;
