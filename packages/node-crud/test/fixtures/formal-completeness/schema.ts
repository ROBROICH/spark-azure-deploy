import { auditLogs } from "@spark-workflow/audit-client/schema";
import { Type, type TObject, type TSchema } from "@sinclair/typebox";
import { createInsertSchema, createSelectSchema } from "drizzle-typebox";
import {
  type AnyPgTable,
  boolean,
  customType,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { NodeDefinition, NodeFieldRule } from "../../../src";

const timestampRange = customType<{ data: string }>({
  dataType: () => "tstzrange",
  fromDriver: (value) => String(value),
});

export const updateType = pgEnum("updatetype", ["AUTOMATED", "MANUAL"]);

const commonColumns = () => ({
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  projectVersion: integer("project_version").notNull().default(1),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  isOutdated: boolean("is_outdated").notNull().default(false),
  frontendParentIds: varchar("frontend_parent_ids").array().notNull().default([]),
  updateType: updateType("update_type").default("AUTOMATED"),
  sysPeriod: timestampRange("sys_period").notNull(),
});

export const categories = pgTable(
  "category",
  {
    ...commonColumns(),
    name: varchar("name").notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.projectVersion] })],
);

export const documentTypes = pgTable(
  "document_type",
  {
    ...commonColumns(),
    categoryId: uuid("category_id"),
    name: varchar("name").notNull(),
    description: text("description").notNull(),
    confidence: real("confidence"),
    isResolved: boolean("is_resolved").notNull().default(false),
    origin: varchar("origin").notNull().default("system"),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.projectVersion] }),
    foreignKey({
      columns: [table.categoryId, table.projectVersion],
      foreignColumns: [categories.id, categories.projectVersion],
    }),
  ],
);

export const documents = pgTable(
  "document",
  {
    ...commonColumns(),
    fileId: uuid("file_id"),
    contentExtractionId: uuid("content_extraction_id"),
    aiSuggestedRequiredDocumentTypeId: uuid("ai_suggested_required_document_type_id"),
    humanRequiredDocumentTypeId: uuid("human_required_document_type_id"),
    documentName: varchar("document_name").notNull(),
    reasoning: text("reasoning"),
    confidence: real("confidence"),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.projectVersion] }),
    foreignKey({
      columns: [table.aiSuggestedRequiredDocumentTypeId, table.projectVersion],
      foreignColumns: [documentTypes.id, documentTypes.projectVersion],
    }),
    foreignKey({
      columns: [table.humanRequiredDocumentTypeId, table.projectVersion],
      foreignColumns: [documentTypes.id, documentTypes.projectVersion],
    }),
  ],
);

export const categoryHistory = pgTable("category_history", {
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  projectVersion: integer("project_version").notNull(),
  name: varchar("name").notNull(),
  isDeleted: boolean("is_deleted").notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});

export const documentTypeHistory = pgTable("document_type_history", {
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  projectVersion: integer("project_version").notNull(),
  name: varchar("name").notNull(),
  description: text("description").notNull(),
  confidence: real("confidence"),
  isDeleted: boolean("is_deleted").notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});

export const documentHistory = pgTable("document_history", {
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  projectVersion: integer("project_version").notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});

const omittedInsertKeys = new Set([
  "id",
  "projectId",
  "projectVersion",
  "createdAt",
  "updatedAt",
  "isDeleted",
  "sysPeriod",
]);

const schemas = (table: AnyPgTable) => {
  const selectProperties = Object.fromEntries(
    Object.entries(createSelectSchema(table).properties).filter(([key]) => key !== "sysPeriod"),
  );
  const response = Type.Object(
    {
      ...selectProperties,
      createdAt: Type.String({ format: "date-time" }),
      updatedAt: Type.String({ format: "date-time" }),
      updateType: Type.Union([Type.Literal("automated"), Type.Literal("manual"), Type.Null()]),
    },
    { additionalProperties: false },
  );
  const insertSource = createInsertSchema(table);
  const insertProperties = Object.fromEntries(
    Object.entries(insertSource.properties).filter(([key]) => !omittedInsertKeys.has(key)),
  ) as Record<string, TSchema>;
  insertProperties.updateType = Type.Optional(
    Type.Union([Type.Literal("automated"), Type.Literal("manual"), Type.Null()]),
  );
  const insert = Type.Object(insertProperties, { additionalProperties: false });
  return {
    response,
    insert,
    patch: Type.Object(Type.Partial(insert).properties, {
      additionalProperties: false,
    }),
  } satisfies { response: TObject; insert: TObject; patch: TObject };
};

const updateTypeRule: NodeFieldRule = {
  toDatabase: (value) => (value === null ? value : `${value}`.toUpperCase()),
  fromDatabase: (value) => (value === null ? value : `${value}`.toLowerCase()),
};

const commonEditableFields = ["isOutdated", "frontendParentIds", "updateType"] as const;

export const formalCompletenessNodes = [
  {
    nodeType: "category",
    table: categories,
    fields: [...commonEditableFields, "name"],
    readonlyFields: [],
    fieldRules: { updateType: updateTypeRule },
    parents: [],
    schemas: schemas(categories),
  },
  {
    nodeType: "document_type",
    table: documentTypes,
    fields: [
      ...commonEditableFields,
      "categoryId",
      "name",
      "description",
      "confidence",
      "isResolved",
      "origin",
    ],
    readonlyFields: [],
    fieldRules: {
      updateType: updateTypeRule,
      description: {
        create: { permissions: ["create"] },
        update: { permissions: ["update"] },
      },
    },
    parents: [{ kind: "persisted", field: "categoryId", nodeType: "category" }],
    schemas: schemas(documentTypes),
  },
  {
    nodeType: "document",
    table: documents,
    fields: [
      ...commonEditableFields,
      "fileId",
      "contentExtractionId",
      "aiSuggestedRequiredDocumentTypeId",
      "humanRequiredDocumentTypeId",
      "documentName",
      "reasoning",
      "confidence",
    ],
    readonlyFields: [],
    fieldRules: { updateType: updateTypeRule },
    parents: [
      {
        kind: "persisted",
        field: "aiSuggestedRequiredDocumentTypeId",
        nodeType: "document_type",
      },
      {
        kind: "persisted",
        field: "humanRequiredDocumentTypeId",
        nodeType: "document_type",
      },
      {
        kind: "external",
        field: "fileId",
        nodeType: "file",
        service: "documentManagementService",
      },
      {
        kind: "external",
        field: "contentExtractionId",
        nodeType: "file",
        service: "documentManagementService",
      },
    ],
    schemas: schemas(documents),
  },
] as const satisfies readonly NodeDefinition[];

export const formalCompletenessSchema = {
  auditLogs,
  categories,
  categoryHistory,
  documentHistory,
  documents,
  documentTypeHistory,
  documentTypes,
};

export const formalCompletenessNodeMetadata = {
  categories: {
    schemas: formalCompletenessNodes.find(({ nodeType }) => nodeType === "category")!.schemas,
  },
  documentTypes: {
    fieldRules: formalCompletenessNodes.find(({ nodeType }) => nodeType === "document_type")!
      .fieldRules,
    schemas: formalCompletenessNodes.find(({ nodeType }) => nodeType === "document_type")!.schemas,
  },
  documents: {
    externalParents: [
      {
        kind: "external",
        field: "fileId",
        nodeType: "file",
        service: "documentManagementService",
      },
      {
        kind: "external",
        field: "contentExtractionId",
        nodeType: "file",
        service: "documentManagementService",
      },
    ],
    schemas: formalCompletenessNodes.find(({ nodeType }) => nodeType === "document")!.schemas,
  },
} as const;
