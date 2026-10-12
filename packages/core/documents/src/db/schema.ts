import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { updateType } from "../../../src/update-type.ts";

const timestampRange = customType<{ data: string; driverData: string }>({
  dataType: () => "tstzrange",
});
const currentPeriod = sql`tstzrange(CURRENT_TIMESTAMP, NULL::timestamp with time zone)`;

export const fileType = pgEnum("filetypeenum", [
  "DOCUMENT",
  "TEMPLATE",
  "LAW_DATA",
  "CONTENT_EXTRACTION",
  "TEMPORAL_CHECKPOINT",
  "ZIP",
  "EWMS_ZIP",
  "EWMS_DOCUMENT",
  "ERWIDERUNGS_IMPORT",
  "ERWIDERUNGS_EXPORT",
  "REDACTED_DOCUMENT",
]);
export { updateType };
export const workflowStatus = pgEnum("workflowstatusenum", [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELED",
  "TERMINATED",
  "CONTINUED_AS_NEW",
  "TIMED_OUT",
  "REQUIRES_APPROVAL",
]);
export const zipApprovalStatus = pgEnum("zipapprovalstatus", [
  "REQUIRES_APPROVAL",
  "APPROVING",
  "APPROVED",
  "FAILED_APPROVE",
  "REJECTED",
]);
export const zipDiffKind = pgEnum("zipdiffkind", [
  "new",
  "deleted",
  "changed",
  "renamed",
  "unchanged",
  "excluded",
]);

export const zipFiles = pgTable(
  "zip_file",
  {
    id: uuid("id").notNull(),
    filename: varchar("filename").notNull(),
    bucketPath: varchar("bucket_path").notNull(),
    projectId: uuid("project_id"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    workflowStatus: workflowStatus("workflow_status").default("PENDING").notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    sysPeriod: timestampRange("sys_period").default(currentPeriod).notNull(),
    type: fileType("type").default("ZIP").notNull(),
    approvalStatus: zipApprovalStatus("approval_status"),
    approvalError: varchar("approval_error"),
    workflowFailureCode: varchar("workflow_failure_code"),
    workflowId: varchar("workflow_id"),
    runId: varchar("run_id"),
    sourceProjectVersion: integer("source_project_version"),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.projectVersion], name: "zip_file_pkey" }),
    index("ix_zip_file_approval_status").on(table.approvalStatus),
    uniqueIndex("ix_zip_file_bucket_path").on(table.bucketPath, table.projectVersion),
    index("ix_zip_file_filename").on(table.filename),
    index("ix_zip_file_project_id").on(table.projectId),
    index("ix_zip_file_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS FALSE`),
    index("ix_zip_file_type").on(table.type),
    index("ix_zip_file_workflow_status").on(table.workflowStatus),
  ],
);

export const files = pgTable(
  "file",
  {
    id: uuid("id").notNull(),
    mimeType: varchar("mime_type").notNull(),
    bucketPath: varchar("bucket_path").notNull(),
    projectId: uuid("project_id"),
    vectorSearchable: boolean("vector_searchable"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    type: fileType("type").notNull(),
    filename: varchar("filename").notNull(),
    workflowId: varchar("workflow_id"),
    runId: varchar("run_id"),
    sourceZipFileId: uuid("source_zip_file_id"),
    isDeleted: boolean("is_deleted").notNull(),
    version: integer("version").default(1).notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    workflowStatus: workflowStatus("workflow_status"),
    sysPeriod: timestampRange("sys_period").default(currentPeriod).notNull(),
    addedInVersion: integer("added_in_version"),
    isOutdated: boolean("is_outdated").default(false).notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.projectVersion], name: "file_pkey" }),
    uniqueIndex("ix_file_bucket_path").on(table.bucketPath, table.projectVersion),
    index("ix_file_filename").on(table.filename),
    index("ix_file_project_id").on(table.projectId),
    index("ix_file_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS FALSE`),
    index("ix_file_source_zip_file_id").on(table.sourceZipFileId),
    index("ix_file_type").on(table.type),
    index("ix_files_type_project").on(table.type, table.projectId),
    uniqueIndex("uq_file_zip_entry_source")
      .on(table.projectId, table.projectVersion, table.type, table.filename, table.sourceZipFileId)
      .where(sql`${table.isDeleted} IS FALSE`),
    foreignKey({
      columns: [table.sourceZipFileId, table.projectVersion],
      foreignColumns: [zipFiles.id, zipFiles.projectVersion],
      name: "file_source_zip_file_id_fkey",
    }),
  ],
);

export const fileTopics = pgTable(
  "file_topic",
  {
    id: uuid("id").notNull(),
    fileId: uuid("file_id").notNull(),
    topicId: uuid("topic_id"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    projectId: uuid("project_id"),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    sysPeriod: timestampRange("sys_period").default(currentPeriod).notNull(),
    subtopicId: uuid("subtopic_id"),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.projectVersion], name: "file_topic_pkey" }),
    index("ix_file_topic_file_id").on(table.fileId),
    index("ix_file_topic_project_id").on(table.projectId),
    index("ix_file_topic_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS FALSE`),
    index("ix_file_topic_subtopic_id").on(table.subtopicId),
    index("ix_file_topic_topic_id").on(table.topicId),
    uniqueIndex("uq_file_subtopic")
      .on(table.fileId, table.projectVersion, table.subtopicId)
      .where(sql`${table.isDeleted} IS FALSE AND ${table.subtopicId} IS NOT NULL`),
    uniqueIndex("uq_file_topic")
      .on(table.fileId, table.projectVersion, table.topicId)
      .where(sql`${table.isDeleted} IS FALSE AND ${table.topicId} IS NOT NULL`),
    foreignKey({
      columns: [table.fileId, table.projectVersion],
      foreignColumns: [files.id, files.projectVersion],
      name: "file_topic_file_id_fkey",
    }).onDelete("cascade"),
    check(
      "ck_file_topic_exactly_one_owner",
      sql`${table.topicId} IS NOT NULL AND ${table.subtopicId} IS NULL OR ${table.topicId} IS NULL AND ${table.subtopicId} IS NOT NULL`,
    ),
  ],
);

export const zipFileDiffEntries = pgTable(
  "zip_file_diff_entry",
  {
    id: uuid("id").primaryKey(),
    zipFileId: uuid("zip_file_id").notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    entryKey: varchar("entry_key").notNull(),
    computedKind: zipDiffKind("computed_kind").notNull(),
    decisionKind: zipDiffKind("decision_kind").notNull(),
    fileId: uuid("file_id"),
    filename: varchar("filename").notNull(),
    oldName: varchar("old_name"),
    newName: varchar("new_name"),
    bucketPath: varchar("bucket_path"),
    sourceSha: varchar("source_sha"),
    targetSha: varchar("target_sha"),
    sha: varchar("sha"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ix_zip_file_diff_entry_file_id").on(table.fileId),
    index("ix_zip_file_diff_entry_zip_file").on(table.zipFileId, table.projectVersion),
    foreignKey({
      columns: [table.zipFileId, table.projectVersion],
      foreignColumns: [zipFiles.id, zipFiles.projectVersion],
      name: "zip_file_diff_entry_zip_file_id_project_version_fkey",
    }).onDelete("cascade"),
    unique("uq_zip_file_diff_entry_key").on(table.zipFileId, table.projectVersion, table.entryKey),
  ],
);

export const fileHistory = pgTable(
  "file_history",
  {
    id: uuid("id").notNull(),
    mimeType: varchar("mime_type").notNull(),
    bucketPath: varchar("bucket_path").notNull(),
    projectId: uuid("project_id"),
    vectorSearchable: boolean("vector_searchable"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    type: fileType("type").notNull(),
    filename: varchar("filename").notNull(),
    workflowId: varchar("workflow_id"),
    runId: varchar("run_id"),
    sourceZipFileId: uuid("source_zip_file_id"),
    isDeleted: boolean("is_deleted").notNull(),
    version: integer("version").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    workflowStatus: workflowStatus("workflow_status"),
    sysPeriod: timestampRange("sys_period").notNull(),
    addedInVersion: integer("added_in_version"),
    isOutdated: boolean("is_outdated"),
    projectVersion: integer("project_version"),
  },
  (table) => [
    index("file_history_id_idx").on(table.id),
    index("file_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const fileTopicHistory = pgTable(
  "file_topic_history",
  {
    id: uuid("id").notNull(),
    fileId: uuid("file_id").notNull(),
    topicId: uuid("topic_id"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    projectId: uuid("project_id"),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    sysPeriod: timestampRange("sys_period").notNull(),
    subtopicId: uuid("subtopic_id"),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("file_topic_history_id_idx").on(table.id),
    index("file_topic_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const zipFileHistory = pgTable(
  "zip_file_history",
  {
    id: uuid("id").notNull(),
    filename: varchar("filename").notNull(),
    bucketPath: varchar("bucket_path").notNull(),
    projectId: uuid("project_id"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    workflowStatus: workflowStatus("workflow_status").notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    sysPeriod: timestampRange("sys_period").notNull(),
    approvalStatus: zipApprovalStatus("approval_status"),
    approvalError: varchar("approval_error"),
    workflowFailureCode: varchar("workflow_failure_code"),
    workflowId: varchar("workflow_id"),
    runId: varchar("run_id"),
    sourceProjectVersion: integer("source_project_version"),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("zip_file_history_id_idx").on(table.id),
    index("zip_file_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const filesRelations = relations(files, ({ many }) => ({ topics: many(fileTopics) }));
export const fileTopicsRelations = relations(fileTopics, ({ one }) => ({
  file: one(files, {
    fields: [fileTopics.fileId, fileTopics.projectVersion],
    references: [files.id, files.projectVersion],
  }),
}));

export const documentManagementSchema = {
  fileHistory,
  fileTopicHistory,
  fileTopics,
  fileTopicsRelations,
  files,
  filesRelations,
  zipFileDiffEntries,
  zipFileHistory,
  zipFiles,
};

export type DocumentManagementSchema = typeof documentManagementSchema;
