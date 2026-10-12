import { updateType } from "@spark-workflow/core/schema";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestampRange = customType<{ data: string; driverData: string }>({
  dataType: () => "tstzrange",
  fromDriver: (value) => String(value),
});

const nodeIdentity = () => ({
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
});

const currentTimestamps = () => ({
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
});

const currentNodeTail = () => ({
  sysPeriod: timestampRange("sys_period")
    .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
    .notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  frontendParentIds: varchar("frontend_parent_ids")
    .array()
    .notNull()
    .default(sql`ARRAY[]::varchar[]`),
  updateType: updateType("update_type").default(sql`'AUTOMATED'::updatetype`),
  projectVersion: integer("project_version").notNull().default(1),
  isOutdated: boolean("is_outdated").notNull().default(false),
});

const historyTimestamps = () => ({
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
});

const historyNodeTail = () => ({
  sysPeriod: timestampRange("sys_period").notNull(),
  isDeleted: boolean("is_deleted"),
  frontendParentIds: varchar("frontend_parent_ids").array(),
  updateType: updateType("update_type"),
  projectVersion: integer("project_version"),
  isOutdated: boolean("is_outdated"),
});

export const categories = pgTable(
  "category",
  {
    ...nodeIdentity(),
    name: varchar("name").notNull(),
    ...currentTimestamps(),
    ...currentNodeTail(),
  },
  (table) => [
    primaryKey({ name: "category_pkey", columns: [table.id, table.projectVersion] }),
    unique("uq_category_project_identity").on(table.id, table.projectId, table.projectVersion),
    index("ix_category_project_id").on(table.projectId),
    index("ix_category_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
  ],
);
export const categoryHistory = pgTable(
  "category_history",
  {
    ...nodeIdentity(),
    name: varchar("name").notNull(),
    ...historyTimestamps(),
    ...historyNodeTail(),
  },
  (table) => [
    index("category_history_id_idx").on(table.id),
    index("category_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const documentTypes = pgTable(
  "document_type",
  {
    ...nodeIdentity(),
    name: varchar("name").notNull(),
    description: text("description").notNull(),
    ...currentTimestamps(),
    confidence: doublePrecision("confidence"),
    categoryId: uuid("category_id"),
    isDeleted: boolean("is_deleted").notNull().default(false),
    isResolved: boolean("is_resolved").notNull().default(false),
    origin: varchar("origin").notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    frontendParentIds: varchar("frontend_parent_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::varchar[]`),
    updateType: updateType("update_type").default(sql`'AUTOMATED'::updatetype`),
    projectVersion: integer("project_version").notNull().default(1),
    isOutdated: boolean("is_outdated").notNull().default(false),
  },
  (table) => [
    primaryKey({ name: "document_type_pkey", columns: [table.id, table.projectVersion] }),
    foreignKey({
      name: "document_type_category_project_fkey",
      columns: [table.categoryId, table.projectId, table.projectVersion],
      foreignColumns: [categories.id, categories.projectId, categories.projectVersion],
    }),
    check("chk_document_type_origin", sql`${table.origin} IN ('system', 'custom')`),
    index("ix_document_type_category_id").on(table.categoryId),
    index("ix_document_type_project_id").on(table.projectId),
    index("ix_document_type_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
    uniqueIndex("uq_document_type_project_name")
      .on(table.projectId, table.projectVersion, table.name)
      .where(sql`${table.isDeleted} IS false`),
  ],
);
export const documentTypeHistory = pgTable(
  "document_type_history",
  {
    ...nodeIdentity(),
    name: varchar("name").notNull(),
    description: text("description").notNull(),
    ...historyTimestamps(),
    confidence: doublePrecision("confidence"),
    categoryId: uuid("category_id"),
    isDeleted: boolean("is_deleted").notNull(),
    isResolved: boolean("is_resolved").notNull(),
    origin: varchar("origin").notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array(),
    updateType: updateType("update_type"),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("document_type_history_id_idx").on(table.id),
    index("document_type_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const documents = pgTable(
  "document",
  {
    ...nodeIdentity(),
    fileId: uuid("file_id"),
    aiSuggestedRequiredDocumentTypeId: uuid("ai_suggested_required_document_type_id"),
    documentName: varchar("document_name").notNull(),
    reasoning: text("reasoning"),
    confidence: doublePrecision("confidence"),
    ...currentTimestamps(),
    humanRequiredDocumentTypeId: uuid("human_required_document_type_id"),
    contentExtractionId: uuid("content_extraction_id"),
    ...currentNodeTail(),
  },
  (table) => [
    primaryKey({ name: "document_pkey", columns: [table.id, table.projectVersion] }),
    foreignKey({
      name: "document_ai_suggested_required_document_type_id_fkey",
      columns: [table.aiSuggestedRequiredDocumentTypeId, table.projectVersion],
      foreignColumns: [documentTypes.id, documentTypes.projectVersion],
    }).onDelete("cascade"),
    foreignKey({
      name: "document_human_required_document_type_id_fkey",
      columns: [table.humanRequiredDocumentTypeId, table.projectVersion],
      foreignColumns: [documentTypes.id, documentTypes.projectVersion],
    }).onDelete("set null"),
    index("ix_document_ai_suggested_required_document_type_id").on(
      table.aiSuggestedRequiredDocumentTypeId,
    ),
    index("ix_document_file_id").on(table.fileId),
    index("ix_document_project_id").on(table.projectId),
    index("ix_document_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
    uniqueIndex("uq_document_project_file_id")
      .on(table.projectId, table.projectVersion, table.fileId)
      .where(sql`${table.fileId} IS NOT NULL`),
  ],
);
export const documentHistory = pgTable(
  "document_history",
  {
    ...nodeIdentity(),
    fileId: uuid("file_id"),
    aiSuggestedRequiredDocumentTypeId: uuid("ai_suggested_required_document_type_id"),
    documentName: varchar("document_name").notNull(),
    reasoning: text("reasoning"),
    confidence: doublePrecision("confidence"),
    ...historyTimestamps(),
    humanRequiredDocumentTypeId: uuid("human_required_document_type_id"),
    contentExtractionId: uuid("content_extraction_id"),
    ...historyNodeTail(),
  },
  (table) => [
    index("document_history_id_idx").on(table.id),
    index("document_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const projectTemplateVersions = pgTable(
  "project_template_version",
  {
    ...nodeIdentity(),
    version: integer("version").notNull(),
    ...currentTimestamps(),
    projectTypeId: uuid("project_type_id"),
    ...currentNodeTail(),
  },
  (table) => [
    primaryKey({
      name: "project_template_version_pkey",
      columns: [table.id, table.projectVersion],
    }),
    index("ix_project_template_version_project_id").on(table.projectId),
    index("ix_project_template_version_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
    uniqueIndex("uq_project_template_version_project_id")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
  ],
);
export const projectTemplateVersionHistory = pgTable(
  "project_template_version_history",
  {
    ...nodeIdentity(),
    version: integer("version").notNull(),
    ...historyTimestamps(),
    projectTypeId: uuid("project_type_id"),
    ...historyNodeTail(),
  },
  (table) => [
    index("project_template_version_history_id_idx").on(table.id),
    index("project_template_version_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const tocNotes = pgTable(
  "table_of_content_notes",
  {
    ...nodeIdentity(),
    content: text("content").notNull(),
    generatedKey: varchar("generated_key", { length: 64 }),
    isResolved: boolean("is_resolved").notNull().default(false),
    ...currentTimestamps(),
    ...currentNodeTail(),
  },
  (table) => [
    primaryKey({
      name: "table_of_content_notes_pkey",
      columns: [table.id, table.projectVersion],
    }),
    uniqueIndex("uq_toc_note_generated_key")
      .on(table.projectId, table.projectVersion, table.generatedKey)
      .where(sql`${table.generatedKey} IS NOT NULL`),
    index("ix_table_of_content_notes_project_id").on(table.projectId),
    index("ix_table_of_content_notes_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
  ],
);
export const tocNoteHistory = pgTable(
  "table_of_content_notes_history",
  {
    ...nodeIdentity(),
    content: text("content").notNull(),
    generatedKey: varchar("generated_key", { length: 64 }),
    isResolved: boolean("is_resolved").notNull(),
    ...historyTimestamps(),
    ...historyNodeTail(),
  },
  (table) => [
    index("table_of_content_notes_history_id_idx").on(table.id),
    index("table_of_content_notes_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const tocStatuses = pgTable(
  "toc_job_status",
  {
    ...nodeIdentity(),
    status: varchar("status").notNull(),
    ...currentTimestamps(),
    ...currentNodeTail(),
  },
  (table) => [
    primaryKey({ name: "toc_job_status_pkey", columns: [table.id, table.projectVersion] }),
    index("ix_toc_job_status_project_id").on(table.projectId),
    index("ix_toc_job_status_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
    uniqueIndex("uq_toc_job_status_project_id")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
  ],
);
export const tocStatusHistory = pgTable(
  "toc_job_status_history",
  {
    ...nodeIdentity(),
    status: varchar("status").notNull(),
    ...historyTimestamps(),
    ...historyNodeTail(),
  },
  (table) => [
    index("toc_job_status_history_id_idx").on(table.id),
    index("toc_job_status_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const resultReceipts = pgTable(
  "formal_completeness_result_receipt",
  {
    projectId: uuid("project_id").notNull(),
    projectVersion: integer("project_version").notNull(),
    kind: varchar("kind", { enum: ["formal", "toc"] }).notNull(),
    fileId: uuid("file_id").notNull(),
    digest: varchar("digest", { length: 64 }).notNull(),
    outcome: jsonb("outcome").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "formal_completeness_result_receipt_pkey",
      columns: [table.projectId, table.projectVersion, table.kind, table.fileId, table.digest],
    }),
  ],
);

export const formalCompletenessSchema = {
  categories,
  categoryHistory,
  documents,
  documentHistory,
  documentTypes,
  documentTypeHistory,
  projectTemplateVersions,
  projectTemplateVersionHistory,
  tocNotes,
  tocNoteHistory,
  tocStatuses,
  tocStatusHistory,
  resultReceipts,
};

export type FormalCompletenessSchema = typeof formalCompletenessSchema;
