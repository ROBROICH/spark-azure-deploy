import { isNotNull, sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const timestampRange = customType<{ data: string; driverData: string }>({
  dataType: () => "tstzrange",
  fromDriver: (value) => String(value),
});

export const supplementaryPriority = pgEnum("priority", ["must", "should"]);

export const supplementaryProcessStep = pgEnum("processstep", [
  "formalCompletenessCheck",
  "plausibilityCheck",
  "materialCompletenessCheck",
  "legalReview",
]);

export const supplementarySourceType = pgEnum("sourcetype", [
  "tableOfContents",
  "requiredDocuments",
  "contradiction",
  "materialLaw",
  "materialNorm",
  "materialSatz",
  "materialFundstelle",
  "manual",
]);

export const supplementaryRequests = pgTable(
  "supplementary_request",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id").notNull(),
    title: varchar("title", { length: 2_000 }).notNull(),
    reason: varchar("reason", { length: 2_000 }).notNull().default(""),
    includedInLetter: boolean("included_in_letter").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull().defaultNow(),
    priority: supplementaryPriority("priority").notNull(),
    processStep: supplementaryProcessStep("process_step"),
    sourceType: supplementarySourceType("source_type"),
    sourceItemId: varchar("source_item_id", { length: 255 }),
    topicId: uuid("topic_id"),
    documentId: uuid("document_id"),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(current_timestamp, null)`)
      .notNull(),
  },
  (table) => [
    index("ix_supplementary_request_project_id").on(table.projectId),
    index("ix_supplementary_request_topic_id").on(table.topicId),
    index("ix_supplementary_request_document_id").on(table.documentId),
    uniqueIndex("uq_project_source_binding")
      .on(table.projectId, table.sourceType, table.sourceItemId)
      .where(isNotNull(table.sourceItemId)),
  ],
);

export const supplementaryRequestHistory = pgTable(
  "supplementary_request_history",
  {
    id: uuid("id").notNull(),
    projectId: uuid("project_id").notNull(),
    title: varchar("title", { length: 2_000 }).notNull(),
    reason: varchar("reason", { length: 2_000 }).notNull(),
    includedInLetter: boolean("included_in_letter").notNull(),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    priority: supplementaryPriority("priority").notNull(),
    processStep: supplementaryProcessStep("process_step"),
    sourceType: supplementarySourceType("source_type"),
    sourceItemId: varchar("source_item_id", { length: 255 }),
    topicId: uuid("topic_id"),
    documentId: uuid("document_id"),
    sysPeriod: timestampRange("sys_period").notNull(),
  },
  (table) => [
    index("supplementary_request_history_id_idx").on(table.id),
    index("supplementary_request_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const supplementaryRequestsDatabaseSchema = {
  supplementaryPriority,
  supplementaryProcessStep,
  supplementaryRequestHistory,
  supplementaryRequests,
  supplementarySourceType,
};
