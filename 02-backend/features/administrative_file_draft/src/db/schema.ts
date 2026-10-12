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
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestampRange = customType<{ data: string; driverData: string }>({
  dataType: () => "tstzrange",
  fromDriver: (value) => String(value),
});

export const riskStatus = pgEnum("status_enum", ["OPEN", "CORRECTED", "IGNORED"]);

/** Lockstep with AOS `AfdVaeNodeSchema` in assessment-contracts.ts. */
export const vaeNodes = pgTable(
  "vae_node",
  {
    id: uuid("id").notNull(),
    title: varchar("title").notNull(),
    text: text("text").notNull(),
    checkedByAssignee: boolean("checked_by_assignee").notNull().default(false),
    checkedByLeader: boolean("checked_by_leader").notNull().default(false),
    checkedAtAssignee: timestamp("checked_at_assignee", { mode: "date", withTimezone: true }),
    checkedAtLeader: timestamp("checked_at_leader", { mode: "date", withTimezone: true }),
    parentVaeNodeId: uuid("parent_vae_node_id"),
    order: doublePrecision("order").notNull().default(0),
    isHidden: boolean("is_hidden").notNull().default(false),
    canAddChild: boolean("can_add_child").notNull().default(false),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    isDeleted: boolean("is_deleted").notNull().default(false),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull().default([]),
    updateType: updateType("update_type").default("AUTOMATED"),
    assignee: uuid("assignee"),
    topicId: uuid("topic_id"),
    templateId: uuid("template_id"),
    sysPeriod: timestampRange("sys_period")
      .notNull()
      .default(sql`tstzrange(current_timestamp, null)`),
    subtopicId: uuid("subtopic_id"),
    projectVersion: integer("project_version").notNull().default(1),
    isOutdated: boolean("is_outdated").notNull().default(false),
  },
  (table) => [
    primaryKey({ name: "vae_node_pkey", columns: [table.id, table.projectVersion] }),
    unique("uq_vae_node_project_scope").on(table.id, table.projectId, table.projectVersion),
    foreignKey({
      columns: [table.parentVaeNodeId, table.projectId, table.projectVersion],
      foreignColumns: [table.id, table.projectId, table.projectVersion],
      name: "vae_node_parent_project_fkey",
    }),
    index("ix_vae_node_parent_order").on(table.parentVaeNodeId, table.order),
    index("ix_vae_node_parent").on(table.parentVaeNodeId),
    index("ix_vae_node_project_id").on(table.projectId),
    index("ix_vae_node_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
    index("ix_vae_node_template").on(table.templateId),
    index("ix_vae_node_topic_id").on(table.topicId),
    index("ix_vae_node_subtopic_id").on(table.subtopicId),
  ],
);

export const vaeNodeHistory = pgTable(
  "vae_node_history",
  {
    id: uuid("id").notNull(),
    title: varchar("title").notNull(),
    text: text("text").notNull(),
    checkedByAssignee: boolean("checked_by_assignee").notNull(),
    checkedByLeader: boolean("checked_by_leader").notNull(),
    checkedAtAssignee: timestamp("checked_at_assignee", { mode: "date", withTimezone: true }),
    checkedAtLeader: timestamp("checked_at_leader", { mode: "date", withTimezone: true }),
    parentVaeNodeId: uuid("parent_vae_node_id"),
    order: doublePrecision("order").notNull(),
    isHidden: boolean("is_hidden").notNull(),
    canAddChild: boolean("can_add_child").notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    assignee: uuid("assignee"),
    topicId: uuid("topic_id"),
    templateId: uuid("template_id"),
    sysPeriod: timestampRange("sys_period").notNull(),
    subtopicId: uuid("subtopic_id"),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("vae_node_history_id_idx").on(table.id),
    index("vae_node_history_sys_period_idx").on(table.sysPeriod),
  ],
);

/** Lockstep with AOS `PersistedRiskSchema` in assessment-contracts.ts. */
export const risks = pgTable(
  "risks",
  {
    id: uuid("id").notNull(),
    projectId: uuid("project_id").notNull(),
    problem: text("problem").notNull(),
    recommendation: text("recommendation"),
    quote: text("quote"),
    severity: integer("severity").notNull(),
    implication: text("implication").notNull(),
    status: riskStatus("status").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    vaeNodeId: uuid("vae_node_id").notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull().default([]),
    updateType: updateType("update_type").default("AUTOMATED"),
    sysPeriod: timestampRange("sys_period")
      .notNull()
      .default(sql`tstzrange(current_timestamp, null)`),
    projectVersion: integer("project_version").notNull().default(1),
    isOutdated: boolean("is_outdated").notNull().default(false),
  },
  (table) => [
    primaryKey({ name: "risks_pkey", columns: [table.id, table.projectVersion] }),
    foreignKey({
      columns: [table.vaeNodeId, table.projectId, table.projectVersion],
      foreignColumns: [vaeNodes.id, vaeNodes.projectId, vaeNodes.projectVersion],
      name: "risks_vae_node_project_fkey",
    }),
    index("ix_risk_vae_node_id").on(table.vaeNodeId),
    index("ix_risks_project_id").on(table.projectId),
    index("ix_risks_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
    check("ck_risks_severity_range", sql`${table.severity} >= 1 AND ${table.severity} <= 10`),
  ],
);

export const risksHistory = pgTable(
  "risks_history",
  {
    id: uuid("id").notNull(),
    projectId: uuid("project_id").notNull(),
    category: text("category"),
    problem: text("problem").notNull(),
    recommendation: text("recommendation"),
    quote: text("quote"),
    severity: integer("severity").notNull(),
    implication: text("implication").notNull(),
    status: riskStatus("status").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    vaeNodeId: uuid("vae_node_id"),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("risks_history_id_idx").on(table.id),
    index("risks_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const afdSchema = {
  riskStatus,
  risks,
  risksHistory,
  vaeNodes,
  vaeNodeHistory,
};

export type AdministrativeFileDraftSchema = typeof afdSchema;
