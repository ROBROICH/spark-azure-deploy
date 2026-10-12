import { sql } from "drizzle-orm";
import {
  customType,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestampRange = customType<{ data: string; driverData: string; default: true }>({
  dataType: () => "tstzrange",
  fromDriver: (value) => String(value),
});

export const commentProcessStep = pgEnum("commentprocessstep", [
  "unsorted",
  "formalCompletenessCheck",
  "plausibilityCheck",
  "materialCompletenessCheck",
  "legalReview",
]);

export const commentSourceType = pgEnum("commentsourcetype", [
  "tableOfContents",
  "requiredDocuments",
  "contradiction",
  "materialLaw",
  "materialNorm",
  "materialSatz",
  "materialFundstelle",
  "manual",
]);

export const comments = pgTable(
  "comment",
  {
    id: uuid("id").primaryKey(),
    title: varchar("title").notNull(),
    content: text("content").notNull(),
    projectId: uuid("project_id").notNull(),
    processStep: commentProcessStep("process_step").notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      withTimezone: true,
    })
      .defaultNow()
      .notNull(),
    sourceType: commentSourceType("source_type"),
    sourceItemId: varchar("source_item_id", { length: 255 }),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(current_timestamp, null)`)
      .notNull(),
  },
  (table) => [
    index("ix_comment_project_id").on(table.projectId),
    index("ix_comment_project_process_step").on(table.projectId, table.processStep),
  ],
);

export const commentHistory = pgTable(
  "comment_history",
  {
    id: uuid("id").notNull(),
    title: varchar("title").notNull(),
    content: text("content").notNull(),
    projectId: uuid("project_id").notNull(),
    processStep: commentProcessStep("process_step").notNull(),
    createdAt: timestamp("created_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    updatedAt: timestamp("updated_at", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
    sourceType: commentSourceType("source_type"),
    sourceItemId: varchar("source_item_id", { length: 255 }),
    sysPeriod: timestampRange("sys_period").notNull(),
  },
  (table) => [
    index("comment_history_id_idx").on(table.id),
    index("comment_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const commentDatabaseSchema = {
  commentHistory,
  commentProcessStep,
  commentSourceType,
  comments,
};
