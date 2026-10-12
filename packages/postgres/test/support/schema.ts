import {
  boolean,
  customType,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestampRange = customType<{ data: string }>({
  dataType: () => "tstzrange",
  fromDriver: (value) => String(value),
});

export const updateType = pgEnum("updatetype", ["AUTOMATED", "MANUAL"]);

export const projectTypes = pgTable("project_type", {
  id: uuid("id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull().default("server-owned"),
});

export const projectTypeHistory = pgTable("project_type_history", {
  id: uuid("id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});

export const projects = pgTable("project", {
  id: uuid("id").notNull(),
  projectId: uuid("project_id"),
  projectVersion: integer("project_version").notNull().default(1),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  originalCreatedAt: timestamp("original_created_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  createdById: uuid("created_by_id").notNull(),
  name: varchar("name"),
  state: varchar("state").$type<"BY" | "BE" | "NW">(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  isOutdated: boolean("is_outdated").notNull().default(false),
  imported: boolean("imported").notNull().default(false),
  frontendParentIds: varchar("frontend_parent_ids")
    .array()
    .notNull()
    .default([]),
  updateType: updateType("update_type"),
  sysPeriod: timestampRange("sys_period").notNull().default("server-owned"),
});

export const projectHistory = pgTable("project_history", {
  id: uuid("id").notNull(),
});

export const topics = pgTable("topic", {
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  projectVersion: integer("project_version").notNull(),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  name: varchar("name").notNull(),
  description: varchar("description"),
  parentTopicId: uuid("parent_topic_id"),
  isDeleted: boolean("is_deleted").notNull(),
  isOutdated: boolean("is_outdated").notNull(),
  frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
  mvpAssignees: uuid("mvp_assignees").array().notNull(),
  rpbAssignees: uuid("rpb_assignees").array().notNull(),
  updateType: updateType("update_type"),
  showInMvp: boolean("show_in_mvp").notNull().default(true),
  showInEwm: boolean("show_in_ewm").notNull().default(false),
  showInBeschluss: boolean("show_in_beschluss").notNull().default(false),
  sysPeriod: timestampRange("sys_period").notNull().default("server-owned"),
});

export const topicHistory = pgTable("topic_history", {
  id: uuid("id").notNull(),
});

export const topicNorms = pgTable("topic_norm", {
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  projectVersion: integer("project_version").notNull(),
  topicId: uuid("topic_id").notNull(),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  jurabk: varchar("jurabk").notNull(),
  paragraphNr: varchar("paragraph_nr"),
  type: varchar("type").$type<"PRUEFUNG" | "VERFAHREN">().notNull(),
  mvpStatus: varchar("mvp_status")
    .$type<"unchecked" | "checked" | "needs_revision">()
    .notNull(),
  satzStatuses: jsonb("satz_statuses")
    .$type<Record<string, string>>()
    .notNull(),
  isDeleted: boolean("is_deleted").notNull(),
  isOutdated: boolean("is_outdated").notNull(),
  frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
  updateType: updateType("update_type"),
  sysPeriod: timestampRange("sys_period").notNull().default("server-owned"),
});

export const topicNormHistory = pgTable("topic_norm_history", {
  id: uuid("id").notNull(),
});

export const projectVersionLocks = pgTable("project_version_lock", {
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  sourceVersion: integer("source_version").notNull(),
  targetVersion: integer("target_version").notNull(),
  zipFileId: uuid("zip_file_id"),
  lockToken: varchar("lock_token").notNull(),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  status: varchar("status")
    .$type<"ACTIVE" | "RELEASED">()
    .notNull()
    .default("ACTIVE"),
  error: varchar("error"),
});

export const auditLogs = pgTable("audit_log", {
  id: uuid("id").notNull(),
  timestamp: timestamp("timestamp", { mode: "date", withTimezone: true })
    .notNull()
    .defaultNow(),
  projectId: uuid("project_id").notNull(),
  entityId: uuid("entity_id"),
  entityType: varchar("entity_type").notNull(),
  changeType: varchar("change_type").notNull(),
  actionType: varchar("action_type"),
  actorUserId: uuid("actor_user_id"),
  triggeredByUserId: uuid("triggered_by_user_id"),
  workflowRunId: varchar("workflow_run_id"),
  workflowType: varchar("workflow_type"),
  requestStartTime: timestamp("request_start_time", {
    mode: "date",
    withTimezone: true,
  }),
  requestId: varchar("request_id"),
});

export const qualificationSchema = {
  auditLogs,
  projectHistory,
  projects,
  projectTypeHistory,
  projectTypes,
  projectVersionLocks,
  topicNorms,
  topicNormHistory,
  topicHistory,
  topics,
};
