import { updateType } from "@spark-workflow/core/schema";
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  doublePrecision,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestampRange = customType<{ data: string; default: true }>({
  dataType: () => "tstzrange",
  fromDriver: (value) => String(value),
});

const currentNodeColumns = () => ({
  id: uuid("id").notNull(),
  projectId: uuid("project_id").notNull(),
  projectVersion: integer("project_version").notNull().default(1),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).defaultNow().notNull(),
  sysPeriod: timestampRange("sys_period")
    .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
    .notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
  frontendParentIds: varchar("frontend_parent_ids")
    .array()
    .notNull()
    .default(sql`ARRAY[]::varchar[]`),
  updateType: updateType("update_type").default(sql`'AUTOMATED'::updatetype`),
  isOutdated: boolean("is_outdated").notNull().default(false),
});

const historyNodeColumns = (projectNullable = false) => ({
  id: uuid("id").notNull(),
  projectId: projectNullable ? uuid("project_id") : uuid("project_id").notNull(),
  projectVersion: integer("project_version"),
  createdAt: timestamp("created_at", { mode: "date", withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true }).notNull(),
  sysPeriod: timestampRange("sys_period").notNull(),
  isDeleted: boolean("is_deleted"),
  frontendParentIds: varchar("frontend_parent_ids").array(),
  updateType: updateType("update_type"),
  isOutdated: boolean("is_outdated"),
});

export const plausibilityNotes = pgTable(
  "plausibility_note",
  {
    ...currentNodeColumns(),
    title: varchar("title"),
    description: text("description").notNull(),
    rating: integer("rating"),
    confidenceScore: doublePrecision("confidence_score"),
    scoreA: doublePrecision("score_a"),
    scoreB: doublePrecision("score_b"),
    evidence: text("evidence").array(),
    mergedCount: integer("merged_count"),
    status: varchar("status").notNull(),
  },
  (table) => [
    primaryKey({ name: "plausibility_note_pkey", columns: [table.id, table.projectVersion] }),
    unique("plausibility_note_project_identity_key").on(
      table.projectId,
      table.id,
      table.projectVersion,
    ),
    check(
      "plausibility_note_confidence_score_check",
      sql`${table.confidenceScore} BETWEEN 0 AND 100`,
    ),
    check("plausibility_note_score_a_check", sql`${table.scoreA} BETWEEN 0 AND 100`),
    check("plausibility_note_score_b_check", sql`${table.scoreB} BETWEEN 0 AND 100`),
    check("plausibility_note_merged_count_check", sql`${table.mergedCount} >= 1`),
    index("ix_plausibility_note_project_id").on(table.projectId),
    index("ix_plausibility_note_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
  ],
);

export const plausibilityNoteHistory = pgTable(
  "plausibility_note_history",
  {
    ...historyNodeColumns(),
    title: varchar("title"),
    description: text("description").notNull(),
    rating: integer("rating"),
    confidenceScore: doublePrecision("confidence_score"),
    scoreA: doublePrecision("score_a"),
    scoreB: doublePrecision("score_b"),
    evidence: text("evidence").array(),
    mergedCount: integer("merged_count"),
    status: varchar("status").notNull(),
  },
  (table) => [
    index("plausibility_note_history_id_idx").on(table.id),
    index("plausibility_note_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const plausibilityNoteOccurrences = pgTable(
  "plausibility_note_occurrence",
  {
    ...currentNodeColumns(),
    plausibilityNoteId: uuid("plausibility_note_id").notNull(),
    documentId: varchar("document_id").notNull(),
    documentName: varchar("document_name"),
    contentExcerpt: text("content_excerpt").notNull(),
    pageNumber: integer("page_number"),
    contradiction: text("contradiction"),
  },
  (table) => [
    primaryKey({
      name: "plausibility_note_occurrence_pkey",
      columns: [table.id, table.projectVersion],
    }),
    foreignKey({
      columns: [table.projectId, table.plausibilityNoteId, table.projectVersion],
      foreignColumns: [
        plausibilityNotes.projectId,
        plausibilityNotes.id,
        plausibilityNotes.projectVersion,
      ],
      name: "plausibility_note_occurrence_project_note_fkey",
    }).onDelete("cascade"),
    index("ix_plausibility_note_occurrence_plausibility_note_id").on(table.plausibilityNoteId),
    index("ix_plausibility_note_occurrence_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`${table.isDeleted} IS false`),
  ],
);

export const plausibilityNotesRelations = relations(plausibilityNotes, ({ many }) => ({
  occurrences: many(plausibilityNoteOccurrences, { relationName: "noteOccurrences" }),
}));

export const plausibilityNoteOccurrencesRelations = relations(
  plausibilityNoteOccurrences,
  ({ one }) => ({
    note: one(plausibilityNotes, {
      relationName: "noteOccurrences",
      fields: [
        plausibilityNoteOccurrences.projectId,
        plausibilityNoteOccurrences.plausibilityNoteId,
        plausibilityNoteOccurrences.projectVersion,
      ],
      references: [
        plausibilityNotes.projectId,
        plausibilityNotes.id,
        plausibilityNotes.projectVersion,
      ],
    }),
  }),
);

export const plausibilityNoteOccurrenceHistory = pgTable(
  "plausibility_note_occurrence_history",
  {
    ...historyNodeColumns(true),
    plausibilityNoteId: uuid("plausibility_note_id").notNull(),
    documentId: varchar("document_id").notNull(),
    documentName: varchar("document_name"),
    contentExcerpt: text("content_excerpt").notNull(),
    pageNumber: integer("page_number"),
    contradiction: text("contradiction"),
  },
  (table) => [
    index("plausibility_note_occurrence_history_id_idx").on(table.id),
    index("plausibility_note_occurrence_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const plausibilityResultDeliveries = pgTable(
  "plausibility_result_delivery",
  {
    projectId: uuid("project_id").notNull(),
    projectVersion: integer("project_version").notNull(),
    fileId: uuid("file_id").notNull(),
    auditId: uuid("audit_id").notNull(),
    contentDigest: varchar("content_digest", { length: 64 }).notNull(),
    contradictionsFound: integer("contradictions_found").notNull(),
    totalOccurrences: integer("total_occurrences").notNull(),
    previousRecordsDeleted: integer("previous_records_deleted").notNull(),
    appliedAt: timestamp("applied_at", { mode: "date", withTimezone: true })
      .default(sql`clock_timestamp()`)
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: "plausibility_result_delivery_pkey",
      columns: [table.projectId, table.projectVersion, table.fileId],
    }),
  ],
);

export const plausibilitySchema = {
  plausibilityResultDeliveries,
  plausibilityNoteHistory,
  plausibilityNoteOccurrenceHistory,
  plausibilityNoteOccurrencesRelations,
  plausibilityNoteOccurrences,
  plausibilityNotesRelations,
  plausibilityNotes,
};
