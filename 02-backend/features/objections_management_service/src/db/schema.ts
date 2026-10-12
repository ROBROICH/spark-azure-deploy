import { updateType } from "@spark-workflow/core/schema";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import type { ExtractedArgument } from "../schemas.ts";

const timestampRange = customType<{ data: string; driverData: string }>({
  dataType: () => "tstzrange",
  fromDriver: (value) => String(value),
});

export const beteiligungTyp = pgEnum("beteiligungtyp", [
  "STELLUNGNAHME",
  "NATURSCHUTZ",
  "EINWENDUNG",
]);
export const extractionStatus = pgEnum("extractionstatus", [
  "SUCCESS",
  "FAILED",
  "PROMPT_INJECTION_ERROR",
  "loading",
]);
export const classificationStatus = pgEnum("classificationstatus", ["loading", "done", "failed"]);
export const argumentStatus = pgEnum("argumentstatus", ["open", "subtopic_reviewed", "done"]);

const currentNodeColumns = () => ({
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  frontendParentIds: varchar("frontend_parent_ids").array().notNull().default([]),
  updateType: updateType("update_type").default("AUTOMATED"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
  sysPeriod: timestampRange("sys_period")
    .default(sql`tstzrange(current_timestamp, null)`)
    .notNull(),
});

const historyNodeColumns = () => ({
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  isDeleted: boolean("is_deleted").notNull(),
  frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
  updateType: updateType("update_type"),
  createdAt: timestamp("created_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  updatedAt: timestamp("updated_at", {
    mode: "date",
    withTimezone: true,
  }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
});

const currentVersionColumns = () => ({
  projectVersion: integer("project_version").notNull().default(1),
  isOutdated: boolean("is_outdated").notNull().default(false),
});

const historyVersionColumns = () => ({
  projectVersion: integer("project_version"),
  isOutdated: boolean("is_outdated"),
});

const beteiligungsEingangCurrentColumns = () => ({
  beteiligungTyp: beteiligungTyp("beteiligung_typ"),
  fileId: uuid("file_id").notNull(),
  extractionStatus: extractionStatus("extraction_status").notNull(),
  classificationStatus: classificationStatus("classification_status").notNull().default("loading"),
});

const beteiligungsEingangHistoryColumns = () => ({
  beteiligungTyp: beteiligungTyp("beteiligung_typ"),
  fileId: uuid("file_id").notNull(),
  extractionStatus: extractionStatus("extraction_status").notNull(),
  classificationStatus: classificationStatus("classification_status").default("done"),
  filename: varchar("filename"),
});

const markdownColumns = () => ({
  beteiligungsEingangId: uuid("beteiligungs_eingang_id").notNull(),
  text: text("text").notNull(),
});

const argumentCurrentColumns = () => ({
  extractionPayload: jsonb("extraction_payload").$type<ExtractedArgument>(),
  beteiligungsEingangId: uuid("beteiligungs_eingang_id").notNull(),
  subTopicId: uuid("sub_topic_id"),
  text: text("text"),
  startIdx: integer("start_idx"),
  endIdx: integer("end_idx"),
  erwiderung: text("erwiderung"),
  einordnung: text("einordnung"),
  context: text("context"),
  contextStartIdx: integer("context_start_idx"),
  contextEndIdx: integer("context_end_idx"),
  inVae: boolean("in_vae").notNull().default(false),
  isValidArgument: boolean("is_valid_argument").notNull().default(true),
  argumentId: varchar("argument_id"),
  topicId: uuid("topic_id"),
  status: argumentStatus("status").notNull().default("open"),
  topicConfidence: doublePrecision("topic_confidence"),
  subTopicConfidence: doublePrecision("sub_topic_confidence"),
});

const argumentHistoryColumns = () => ({
  extractionPayload: jsonb("extraction_payload").$type<ExtractedArgument>(),
  beteiligungsEingangId: uuid("beteiligungs_eingang_id").notNull(),
  subTopicId: uuid("sub_topic_id"),
  text: text("text"),
  startIdx: integer("start_idx"),
  endIdx: integer("end_idx"),
  erwiderung: text("erwiderung"),
  einordnung: text("einordnung"),
  context: text("context"),
  contextStartIdx: integer("context_start_idx"),
  contextEndIdx: integer("context_end_idx"),
  inVae: boolean("in_vae").notNull(),
  isValidArgument: boolean("is_valid_argument").notNull(),
  argumentId: varchar("argument_id"),
  topicId: uuid("topic_id"),
  status: argumentStatus("status").default("open"),
  topicConfidence: doublePrecision("topic_confidence"),
  subTopicConfidence: doublePrecision("sub_topic_confidence"),
});

export const beteiligungsEingaenge = pgTable(
  "beteiligungs_eingang",
  {
    ...currentNodeColumns(),
    ...beteiligungsEingangCurrentColumns(),
    filename: varchar("filename"),
    ...currentVersionColumns(),
    markdownId: uuid("beteiligungs_eingang_markdown_id"),
  },
  (table) => [
    primaryKey({ name: "beteiligungs_eingang_pkey", columns: [table.id, table.projectVersion] }),
    unique("uq_beteiligungs_eingang_project_identity").on(
      table.id,
      table.projectId,
      table.projectVersion,
    ),
    index("ix_beteiligungs_eingang_project_id").on(table.projectId),
    index("ix_beteiligungs_eingang_beteiligungs_eingang_markdown_id").on(table.markdownId),
    uniqueIndex("uq_beteiligungs_eingang_project_file")
      .on(table.projectId, table.projectVersion, table.fileId)
      .where(sql`${table.isDeleted} IS false`),
  ],
);
export const beteiligungsEingangHistory = pgTable(
  "beteiligungs_eingang_history",
  {
    ...historyNodeColumns(),
    ...beteiligungsEingangHistoryColumns(),
    ...historyVersionColumns(),
    markdownId: uuid("beteiligungs_eingang_markdown_id"),
  },
  (table) => [
    index("beteiligungs_eingang_history_id_idx").on(table.id),
    index("beteiligungs_eingang_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const beteiligungsEingangMarkdown = pgTable(
  "beteiligungs_eingang_markdown",
  {
    id: uuid("id").notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    isOutdated: boolean("is_outdated").notNull().default(false),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull().default([]),
    projectVersion: integer("project_version").notNull().default(1),
    updateType: updateType("update_type").default("AUTOMATED"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(current_timestamp, null)`)
      .notNull(),
    ...markdownColumns(),
  },
  (table) => [
    primaryKey({
      name: "beteiligungs_eingang_markdown_pkey",
      columns: [table.id, table.projectVersion],
    }),
    foreignKey({
      columns: [table.beteiligungsEingangId, table.projectId, table.projectVersion],
      foreignColumns: [
        beteiligungsEingaenge.id,
        beteiligungsEingaenge.projectId,
        beteiligungsEingaenge.projectVersion,
      ],
      name: "beteiligungs_eingang_markdown_parent_project_fkey",
    }).onDelete("cascade"),
    index("ix_beteiligungs_eingang_markdown_beteiligungs_eingang_id").on(
      table.beteiligungsEingangId,
    ),
    index("ix_beteiligungs_eingang_markdown_project_id").on(table.projectId),
    index("ix_beteiligungs_eingang_markdown_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
    uniqueIndex("uq_beteiligungs_eingang_markdown_parent")
      .on(table.projectId, table.projectVersion, table.beteiligungsEingangId)
      .where(sql`${table.isDeleted} IS false`),
  ],
);
export const beteiligungsEingangMarkdownHistory = pgTable(
  "beteiligungs_eingang_markdown_history",
  {
    id: uuid("id").notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    isOutdated: boolean("is_outdated").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    projectVersion: integer("project_version").notNull(),
    updateType: updateType("update_type"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    ...markdownColumns(),
  },
  (table) => [
    index("beteiligungs_eingang_markdown_history_id_idx").on(table.id),
    index("beteiligungs_eingang_markdown_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const argumentsTable = pgTable(
  "argument",
  { ...currentNodeColumns(), ...argumentCurrentColumns(), ...currentVersionColumns() },
  (table) => [
    primaryKey({ name: "argument_pkey", columns: [table.id, table.projectVersion] }),
    foreignKey({
      columns: [table.beteiligungsEingangId, table.projectId, table.projectVersion],
      foreignColumns: [
        beteiligungsEingaenge.id,
        beteiligungsEingaenge.projectId,
        beteiligungsEingaenge.projectVersion,
      ],
      name: "argument_parent_project_fkey",
    }).onDelete("cascade"),
    index("ix_argument_beteiligungs_eingang_id").on(table.beteiligungsEingangId),
    index("ix_argument_project_id").on(table.projectId),
    index("ix_argument_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
    index("ix_argument_sub_topic_id").on(table.subTopicId),
    index("ix_argument_topic_id").on(table.topicId),
    uniqueIndex("uq_argument_project_id_argument_id")
      .on(table.projectId, table.projectVersion, table.argumentId)
      .where(sql`${table.isDeleted} IS false`),
  ],
);
export const argumentHistory = pgTable(
  "argument_history",
  { ...historyNodeColumns(), ...argumentHistoryColumns(), ...historyVersionColumns() },
  (table) => [
    index("argument_history_id_idx").on(table.id),
    index("argument_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const beteiligungsEingaengeRelations = relations(beteiligungsEingaenge, ({ many, one }) => ({
  arguments: many(argumentsTable),
  markdown: one(beteiligungsEingangMarkdown, {
    fields: [
      beteiligungsEingaenge.id,
      beteiligungsEingaenge.projectId,
      beteiligungsEingaenge.projectVersion,
    ],
    references: [
      beteiligungsEingangMarkdown.beteiligungsEingangId,
      beteiligungsEingangMarkdown.projectId,
      beteiligungsEingangMarkdown.projectVersion,
    ],
  }),
}));

export const beteiligungsEingangMarkdownRelations = relations(
  beteiligungsEingangMarkdown,
  ({ one }) => ({
    beteiligungsEingang: one(beteiligungsEingaenge, {
      fields: [
        beteiligungsEingangMarkdown.beteiligungsEingangId,
        beteiligungsEingangMarkdown.projectId,
        beteiligungsEingangMarkdown.projectVersion,
      ],
      references: [
        beteiligungsEingaenge.id,
        beteiligungsEingaenge.projectId,
        beteiligungsEingaenge.projectVersion,
      ],
    }),
  }),
);

export const argumentsRelations = relations(argumentsTable, ({ one }) => ({
  beteiligungsEingang: one(beteiligungsEingaenge, {
    fields: [
      argumentsTable.beteiligungsEingangId,
      argumentsTable.projectId,
      argumentsTable.projectVersion,
    ],
    references: [
      beteiligungsEingaenge.id,
      beteiligungsEingaenge.projectId,
      beteiligungsEingaenge.projectVersion,
    ],
  }),
}));

export const objectionsSchema = {
  argumentStatus,
  argumentHistory,
  argumentsRelations,
  argumentsTable,
  beteiligungTyp,
  beteiligungsEingangHistory,
  beteiligungsEingangMarkdown,
  beteiligungsEingangMarkdownHistory,
  beteiligungsEingangMarkdownRelations,
  beteiligungsEingaenge,
  beteiligungsEingaengeRelations,
  classificationStatus,
  extractionStatus,
};

export type ObjectionsSchema = typeof objectionsSchema;
