import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestampRange = customType<{ data: string; default: true }>({
  dataType: () => "tstzrange",
  fromDriver: (value) => String(value),
});

export const feedbackRatingEnum = pgEnum("feedbackrating", ["POSITIVE", "NEGATIVE"]);

const updateType = customType<{
  data: "automated" | "manual";
  driverData: string;
  default: true;
}>({
  dataType: () => "updatetype",
  fromDriver: (value) => value.toLowerCase() as "automated" | "manual",
  toDriver: (value) => value.toUpperCase(),
});
const feedbackRating = customType<{
  data: "positive" | "negative";
  driverData: string;
}>({
  dataType: () => "feedbackrating",
  fromDriver: (value) => value.toLowerCase() as "positive" | "negative",
  toDriver: (value) => value.toUpperCase(),
});

export const feedback = pgTable(
  "feedback",
  {
    id: uuid("id").notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").notNull().default(false),
    frontendParentIds: varchar("frontend_parent_ids")
      .array()
      .notNull()
      .default(sql`ARRAY[]::varchar[]`),
    updateType: updateType("update_type").default(sql`'AUTOMATED'::updatetype`),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(now(), null)`)
      .notNull(),
    rating: feedbackRating("rating").notNull(),
    reason: varchar("reason", { length: 30 }),
    text: varchar("text", { length: 5_000 }),
    userId: uuid("user_id").notNull(),
    projectVersion: integer("project_version").notNull().default(1),
    isOutdated: boolean("is_outdated").notNull().default(false),
  },
  (table) => [
    primaryKey({ name: "feedback_pkey", columns: [table.id, table.projectVersion] }),
    index("ix_feedback_project_id").on(table.projectId),
    index("ix_feedback_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
  ],
);

export const feedbackHistory = pgTable(
  "feedback_history",
  {
    id: uuid("id").notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    rating: feedbackRating("rating").notNull(),
    reason: varchar("reason", { length: 30 }),
    text: varchar("text", { length: 5_000 }),
    userId: uuid("user_id").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("feedback_history_id_idx").on(table.id),
    index("feedback_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const feedbackSchema = { feedback, feedbackHistory, feedbackRatingEnum };
