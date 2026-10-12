import type { Static } from "@sinclair/typebox";
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
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type {
  RechtsmethodikWorkflowOutput,
  Sollensanordnungen,
  RechtsfolgenAdressat,
  Ermessensspielraum,
  ErmessensArt,
} from "@spark-temporal/contracts";

const timestampRange = customType<{ data: string }>({
  dataType: () => "tstzrange",
  fromDriver: (value) => String(value),
});

export const absatzHistory = pgTable(
  "absatz_history",
  {
    normId: uuid("norm_id").notNull(),
    absatzNr: varchar("absatz_nr").notNull(),
    text: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("absatz_history_id_idx").on(table.id),
    index("absatz_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const adressatHistory = pgTable(
  "adressat_history",
  {
    rechtsfolgeId: uuid("rechtsfolge_id").notNull(),
    entscheidung: varchar().$type<Static<typeof RechtsfolgenAdressat>>().notNull(),
    reasoning: text(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("adressat_history_id_idx").on(table.id),
    index("adressat_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const atomaresTbmHistory = pgTable(
  "atomares_tbm_history",
  {
    satzId: uuid("satz_id").notNull(),
    text: text().notNull(),
    prueffrage: text(),
    pruefgegenstand: text(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("atomares_tbm_history_id_idx").on(table.id),
    index("atomares_tbm_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const auslegungsvorschlagHistory = pgTable(
  "auslegungsvorschlag_history",
  {
    unbestimmterRechtsbegriffId: uuid("unbestimmter_rechtsbegriff_id").notNull(),
    methode: varchar().notNull(),
    text: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("auslegungsvorschlag_history_id_idx").on(table.id),
    index("auslegungsvorschlag_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const bestimmterRechtsbegriffHistory = pgTable(
  "bestimmter_rechtsbegriff_history",
  {
    atomaresTbmId: uuid("atomares_tbm_id").notNull(),
    begriff: varchar().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("bestimmter_rechtsbegriff_history_id_idx").on(table.id),
    index("bestimmter_rechtsbegriff_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const bewertungHistory = pgTable(
  "bewertung_history",
  {
    satzId: uuid("satz_id").notNull(),
    result: varchar().notNull(),
    kurzform: text(),
    norm: text().notNull(),
    markdownTextId: uuid("markdown_text_id").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    isOutdated: boolean("is_outdated"),
    projectVersion: integer("project_version"),
  },
  (table) => [
    index("bewertung_history_id_idx").on(table.id),
    index("bewertung_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const bewertungKapitelHistory = pgTable(
  "bewertung_kapitel_history",
  {
    bewertungId: uuid("bewertung_id").notNull(),
    titel: text().notNull(),
    markdown: text().notNull(),
    kurzform: text(),
    order: integer().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("bewertung_kapitel_history_id_idx").on(table.id),
    index("bewertung_kapitel_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const bewertungQuelleHistory = pgTable(
  "bewertung_quelle_history",
  {
    bewertungId: uuid("bewertung_id").notNull(),
    dokumentId: uuid("dokument_id").notNull(),
    fundstelleId: uuid("fundstelle_id"),
    title: text().notNull(),
    chunkIds: varchar("chunk_ids").array().notNull(),
    pageNumbers: integer("page_numbers").array().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    citedSvmId: varchar("cited_svm_id", { length: 10 }),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("bewertung_quelle_history_id_idx").on(table.id),
    index("bewertung_quelle_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const chunkHistory = pgTable(
  "chunk_history",
  {
    dokumentId: uuid("dokument_id").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    header: text().notNull(),
    pageNumbers: integer("page_numbers").array().notNull(),
    tocPath: varchar("toc_path").array().notNull(),
    allSubchapters: varchar("all_subchapters").array().notNull(),
    order: integer().notNull(),
    nextChunkId: uuid("next_chunk_id"),
    previousChunkId: uuid("previous_chunk_id"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    pageIndexNodeId: varchar("page_index_node_id"),
    pageIndexPosition: integer("page_index_position"),
    pageIndexSummary: text("page_index_summary"),
    pageContent: text("page_content").notNull(),
    hypotheticalQuestions: varchar("hypothetical_questions").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("chunk_history_id_idx").on(table.id),
    index("chunk_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const dokumentHistory = pgTable(
  "dokument_history",
  {
    filename: varchar().notNull(),
    mimeType: varchar("mime_type").notNull(),
    pageCount: integer("page_count").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    dmsFileId: uuid("dms_file_id").notNull(),
    documentType: varchar("document_type"),
    summary: text().notNull(),
    markdownTextId: uuid("markdown_text_id").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    documentId: varchar("document_id"),
    sysPeriod: timestampRange("sys_period").notNull(),
    isOutdated: boolean("is_outdated"),
    projectVersion: integer("project_version"),
    isTocDocument: boolean("is_toc_document"),
  },
  (table) => [
    index("dokument_history_id_idx").on(table.id),
    index("dokument_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const ermessensartHistory = pgTable(
  "ermessensart_history",
  {
    rechtsfolgeId: uuid("rechtsfolge_id").notNull(),
    art: varchar().$type<Static<typeof ErmessensArt>>().notNull(),
    reasoning: text(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("ermessensart_history_id_idx").on(table.id),
    index("ermessensart_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const ermessensspielraumHistory = pgTable(
  "ermessensspielraum_history",
  {
    rechtsfolgeId: uuid("rechtsfolge_id").notNull(),
    entscheidung: varchar().$type<Static<typeof Ermessensspielraum>>().notNull(),
    reasoning: text(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("ermessensspielraum_history_id_idx").on(table.id),
    index("ermessensspielraum_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const expliziterVerweisHistory = pgTable(
  "expliziter_verweis_history",
  {
    rechtsfolgeId: uuid("rechtsfolge_id"),
    atomaresTbmId: uuid("atomares_tbm_id"),
    gesetz: varchar(),
    paragraphNr: varchar("paragraph_nr"),
    absatzNr: varchar("absatz_nr"),
    satzNr: varchar("satz_nr"),
    untergliederung: json(),
    verweisTyp: varchar("verweis_typ"),
    kontext: json(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("expliziter_verweis_history_id_idx").on(table.id),
    index("expliziter_verweis_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const fundstelleHistory = pgTable(
  "fundstelle_history",
  {
    sourceNodeId: text("source_node_id"),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    dokumentId: uuid("dokument_id").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    satzId: uuid("satz_id").notNull(),
    gesetzId: uuid("gesetz_id").notNull(),
    normId: uuid("norm_id").notNull(),
    title: text().notNull(),
    text: text().notNull(),
    pageNumbers: integer("page_numbers").array().notNull(),
    chunkIds: uuid("chunk_ids").array().notNull(),
    confidence: doublePrecision(),
    consensusRatio: doublePrecision("consensus_ratio"),
    relevance: doublePrecision(),
    sysPeriod: timestampRange("sys_period").notNull(),
    isOutdated: boolean("is_outdated"),
    projectVersion: integer("project_version"),
  },
  (table) => [
    index("fundstelle_history_id_idx").on(table.id),
    index("fundstelle_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const gesetzHistory = pgTable(
  "gesetz_history",
  {
    name: text().notNull(),
    jurabk: varchar().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("gesetz_history_id_idx").on(table.id),
    index("gesetz_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const gsPruefungHistory = pgTable(
  "gs_pruefung_history",
  {
    topic: varchar().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("gs_pruefung_history_id_idx").on(table.id),
    index("gs_pruefung_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const impliziterVerweisHistory = pgTable(
  "impliziter_verweis_history",
  {
    rechtsfolgeId: uuid("rechtsfolge_id"),
    atomaresTbmId: uuid("atomares_tbm_id"),
    targetRef: varchar("target_ref"),
    rationale: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("impliziter_verweis_history_id_idx").on(table.id),
    index("impliziter_verweis_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const ivPruefungHistory = pgTable(
  "iv_pruefung_history",
  {
    topic: varchar().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("iv_pruefung_history_id_idx").on(table.id),
    index("iv_pruefung_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const legaldefinitionHistory = pgTable(
  "legaldefinition_history",
  {
    bestimmterRechtsbegriffId: uuid("bestimmter_rechtsbegriff_id").notNull(),
    begriff: varchar().notNull(),
    definition: text().notNull(),
    sourceJurabk: varchar("source_jurabk"),
    sourceParagraphNr: varchar("source_paragraph_nr"),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("legaldefinition_history_id_idx").on(table.id),
    index("legaldefinition_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const markdownTextHistory = pgTable(
  "markdown_text_history",
  {
    text: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("markdown_text_history_id_idx").on(table.id),
    index("markdown_text_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const normDeconstructionHistory = pgTable(
  "norm_deconstruction_history",
  {
    id: uuid().notNull(),
    jurabk: varchar().notNull(),
    paragraph: varchar().notNull(),
    deconstruction: json().$type<RechtsmethodikWorkflowOutput>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
  },
  (table) => [
    index("norm_deconstruction_history_id_idx").on(table.id),
    index("norm_deconstruction_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const normHistory = pgTable(
  "norm_history",
  {
    gesetzId: uuid("gesetz_id").notNull(),
    paragraphNr: varchar("paragraph_nr").notNull(),
    paragraphTitel: text("paragraph_titel"),
    text: text().notNull(),
    regelungsgegenstand: text(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("norm_history_id_idx").on(table.id),
    index("norm_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const normDeconstruction = pgTable(
  "norm_deconstruction",
  {
    id: uuid().primaryKey().notNull(),
    jurabk: varchar().notNull(),
    paragraph: varchar().notNull(),
    deconstruction: json().$type<RechtsmethodikWorkflowOutput>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
  },
  (table) => [unique("uq_norm_deconstruction_jurabk_paragraph").on(table.jurabk, table.paragraph)],
);

export const normvorschlagHistory = pgTable(
  "normvorschlag_history",
  {
    normId: uuid("norm_id").notNull(),
    reason: text().notNull(),
    confidence: doublePrecision().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("normvorschlag_history_id_idx").on(table.id),
    index("normvorschlag_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const examinationProjectHistory = pgTable(
  "examination_project_history",
  {
    projectId: uuid("project_id"),
    id: uuid().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("examination_project_history_id_idx").on(table.id),
    index("examination_project_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const rechtsfolgeHistory = pgTable(
  "rechtsfolge_history",
  {
    satzId: uuid("satz_id").notNull(),
    text: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("rechtsfolge_history_id_idx").on(table.id),
    index("rechtsfolge_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const requiredDocHistory = pgTable(
  "required_doc_history",
  {
    gsPruefungId: uuid("gs_pruefung_id").notNull(),
    docType: varchar("doc_type").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("required_doc_history_id_idx").on(table.id),
    index("required_doc_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const satzHistory = pgTable(
  "satz_history",
  {
    lastSuzResultId: uuid("last_suz_result_id"),
    absatzId: uuid("absatz_id").notNull(),
    satzNr: varchar("satz_nr").notNull(),
    text: text().notNull(),
    normTypLvl1: varchar("norm_typ_lvl_1"),
    normTypLvl2: varchar("norm_typ_lvl_2"),
    tatbestandsmerkmale: json().$type<string[]>(),
    formel: text(),
    wennDann: text("wenn_dann"),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    markers: text().array().notNull(),
    position: integer(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("satz_history_id_idx").on(table.id),
    index("satz_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const sollDokumentHistory = pgTable(
  "soll_dokument_history",
  {
    ivPruefungId: uuid("iv_pruefung_id").notNull(),
    docType: varchar("doc_type").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("soll_dokument_history_id_idx").on(table.id),
    index("soll_dokument_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const sollensanordnungenHistory = pgTable(
  "sollensanordnungen_history",
  {
    rechtsfolgeId: uuid("rechtsfolge_id").notNull(),
    kategorie: varchar().$type<Static<typeof Sollensanordnungen>>().notNull(),
    reasoning: text(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("sollensanordnungen_history_id_idx").on(table.id),
    index("sollensanordnungen_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const standangabeHistory = pgTable(
  "standangabe_history",
  {
    gesetzId: uuid("gesetz_id").notNull(),
    standtyp: varchar().notNull(),
    standkommentar: text().notNull(),
    doknr: varchar(),
    externalId: integer("external_id"),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("standangabe_history_id_idx").on(table.id),
    index("standangabe_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const subChunkHistory = pgTable(
  "sub_chunk_history",
  {
    chunkId: uuid("chunk_id").notNull(),
    header: text().notNull(),
    chunkType: varchar("chunk_type").notNull(),
    focusTopic: text("focus_topic").notNull(),
    hypotheticalQuestions: varchar("hypothetical_questions").array().notNull(),
    order: integer().notNull(),
    nextSubChunkId: uuid("next_sub_chunk_id"),
    previousSubChunkId: uuid("previous_sub_chunk_id"),
    markdownTextId: uuid("markdown_text_id").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    pageNumbers: integer("page_numbers").array().notNull(),
    header1: text("header_1"),
    header2: text("header_2"),
    header3: text("header_3"),
    wildlifeMentioned: boolean("wildlife_mentioned"),
    plantSpeciesMentioned: boolean("plant_species_mentioned"),
    wildlifeSpecies: varchar("wildlife_species").array().notNull(),
    plantSpecies: varchar("plant_species").array().notNull(),
    mapScale: varchar("map_scale"),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("sub_chunk_history_id_idx").on(table.id),
    index("sub_chunk_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const subChunkImageHistory = pgTable(
  "sub_chunk_image_history",
  {
    subChunkId: uuid("sub_chunk_id").notNull(),
    assetPath: varchar("asset_path").notNull(),
    caption: text().notNull(),
    summary: text().notNull(),
    description: text().notNull(),
    content: text().notNull(),
    footnote: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("sub_chunk_image_history_id_idx").on(table.id),
    index("sub_chunk_image_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const subChunkRelationHistory = pgTable(
  "sub_chunk_relation_history",
  {
    fromSubChunkId: uuid("from_sub_chunk_id").notNull(),
    toSubChunkId: uuid("to_sub_chunk_id").notNull(),
    relationType: varchar("relation_type").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("sub_chunk_relation_history_id_idx").on(table.id),
    index("sub_chunk_relation_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const subChunkTableHistory = pgTable(
  "sub_chunk_table_history",
  {
    subChunkId: uuid("sub_chunk_id").notNull(),
    assetPath: varchar("asset_path").notNull(),
    caption: text().notNull(),
    summary: text().notNull(),
    description: text().notNull(),
    content: text().notNull(),
    footnote: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("sub_chunk_table_history_id_idx").on(table.id),
    index("sub_chunk_table_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const subChunkTextHistory = pgTable(
  "sub_chunk_text_history",
  {
    subChunkId: uuid("sub_chunk_id").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    updateType: updateType("update_type"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("sub_chunk_text_history_id_idx").on(table.id),
    index("sub_chunk_text_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const technischeNormEntryHistory = pgTable(
  "technische_norm_entry_history",
  {
    technischeNormId: uuid("technische_norm_id").notNull(),
    entryId: varchar("entry_id").notNull(),
    kurzbeschreibung: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("technische_norm_entry_history_id_idx").on(table.id),
    index("technische_norm_entry_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const technischeNormHistory = pgTable(
  "technische_norm_history",
  {
    atomaresTbmId: uuid("atomares_tbm_id").notNull(),
    name: varchar().notNull(),
    confidence: doublePrecision().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("technische_norm_history_id_idx").on(table.id),
    index("technische_norm_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const unbestimmterRechtsbegriffHistory = pgTable(
  "unbestimmter_rechtsbegriff_history",
  {
    atomaresTbmId: uuid("atomares_tbm_id").notNull(),
    begriff: varchar().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
    auslegung: text().notNull(),
  },
  (table) => [
    index("unbestimmter_rechtsbegriff_history_id_idx").on(table.id),
    index("unbestimmter_rechtsbegriff_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const verwaltungsaktentwurfTeilHistory = pgTable(
  "verwaltungsaktentwurf_teil_history",
  {
    bewertungId: uuid("bewertung_id").notNull(),
    text: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("verwaltungsaktentwurf_teil_history_id_idx").on(table.id),
    index("verwaltungsaktentwurf_teil_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const widerspruchHistory = pgTable(
  "widerspruch_history",
  {
    dokumentId: uuid("dokument_id").notNull(),
    text: text().notNull(),
    severity: varchar().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("widerspruch_history_id_idx").on(table.id),
    index("widerspruch_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const zugeordnetesDokumentHistory = pgTable(
  "zugeordnetes_dokument_history",
  {
    dokumentId: uuid("dokument_id").notNull(),
    requiredDocId: uuid("required_doc_id"),
    sollDokumentId: uuid("soll_dokument_id"),
    sourceDocumentId: uuid("source_document_id").notNull(),
    matchScore: doublePrecision("match_score").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("zugeordnetes_dokument_history_id_idx").on(table.id),
    index("zugeordnetes_dokument_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const zusammenfassungHistory = pgTable(
  "zusammenfassung_history",
  {
    dokumentId: uuid("dokument_id").notNull(),
    requiredDocId: uuid("required_doc_id"),
    sollDokumentId: uuid("soll_dokument_id"),
    text: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull(),
    isDeleted: boolean("is_deleted").notNull(),
    updateType: updateType("update_type"),
    frontendParentIds: varchar("frontend_parent_ids").array().notNull(),
    sysPeriod: timestampRange("sys_period").notNull(),
    projectVersion: integer("project_version"),
    isOutdated: boolean("is_outdated"),
  },
  (table) => [
    index("zusammenfassung_history_id_idx").on(table.id),
    index("zusammenfassung_history_sys_period_idx").on(table.sysPeriod),
  ],
);

export const project = pgTable(
  "examination_project",
  {
    projectId: uuid("project_id"),
    id: uuid().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_examination_project_project_id").on(table.projectId),
    index("ix_examination_project_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.projectId, table.projectVersion],
      foreignColumns: [table.id, table.projectVersion],
      name: "examination_project_project_id_fkey",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.id, table.projectVersion],
      name: "examination_project_pkey",
    }),
  ],
);

export const ivPruefung = pgTable(
  "iv_pruefung",
  {
    topic: varchar().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_iv_pruefung_project_id").on(table.projectId),
    index("ix_iv_pruefung_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    primaryKey({ columns: [table.id, table.projectVersion], name: "iv_pruefung_pkey" }),
  ],
);

/** Lockstep with AOS `MarkdownTextInsertPayloadSchema` in assessment-contracts.ts. */
export const markdownText = pgTable(
  "markdown_text",
  {
    text: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_markdown_text_project_id").on(table.projectId),
    index("ix_markdown_text_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    primaryKey({ columns: [table.id, table.projectVersion], name: "markdown_text_pkey" }),
  ],
);

export const gsPruefung = pgTable(
  "gs_pruefung",
  {
    topic: varchar().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_gs_pruefung_project_id").on(table.projectId),
    index("ix_gs_pruefung_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    primaryKey({ columns: [table.id, table.projectVersion], name: "gs_pruefung_pkey" }),
  ],
);

export const subChunkText = pgTable(
  "sub_chunk_text",
  {
    subChunkId: uuid("sub_chunk_id").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_sub_chunk_text_project_id").on(table.projectId),
    index("ix_sub_chunk_text_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_sub_chunk_text_sub_chunk_id").on(table.subChunkId),
    foreignKey({
      columns: [table.subChunkId, table.projectVersion],
      foreignColumns: [subChunk.id, subChunk.projectVersion],
      name: "sub_chunk_text_sub_chunk_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "sub_chunk_text_pkey" }),
  ],
);

export const bestimmterRechtsbegriff = pgTable(
  "bestimmter_rechtsbegriff",
  {
    atomaresTbmId: uuid("atomares_tbm_id").notNull(),
    begriff: varchar().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_bestimmter_rechtsbegriff_atomares_tbm_id").on(table.atomaresTbmId),
    index("ix_bestimmter_rechtsbegriff_project_id").on(table.projectId),
    index("ix_bestimmter_rechtsbegriff_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.atomaresTbmId, table.projectVersion],
      foreignColumns: [atomaresTbm.id, atomaresTbm.projectVersion],
      name: "bestimmter_rechtsbegriff_atomares_tbm_id_fkey",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.id, table.projectVersion],
      name: "bestimmter_rechtsbegriff_pkey",
    }),
  ],
);

export const gesetz = pgTable(
  "gesetz",
  {
    name: text().notNull(),
    jurabk: varchar().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_gesetz_project_id").on(table.projectId),
    index("ix_gesetz_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    uniqueIndex("uq_gesetz_project_id_jurabk")
      .on(table.projectId, table.projectVersion, table.jurabk)
      .where(sql`(is_deleted IS FALSE)`),
    primaryKey({ columns: [table.id, table.projectVersion], name: "gesetz_pkey" }),
  ],
);

export const rechtsfolge = pgTable(
  "rechtsfolge",
  {
    satzId: uuid("satz_id").notNull(),
    text: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_rechtsfolge_project_id").on(table.projectId),
    index("ix_rechtsfolge_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_rechtsfolge_satz_id").on(table.satzId),
    foreignKey({
      columns: [table.satzId, table.projectVersion],
      foreignColumns: [satz.id, satz.projectVersion],
      name: "rechtsfolge_satz_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "rechtsfolge_pkey" }),
  ],
);

export const requiredDoc = pgTable(
  "required_doc",
  {
    gsPruefungId: uuid("gs_pruefung_id").notNull(),
    docType: varchar("doc_type").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_required_doc_gs_pruefung_id").on(table.gsPruefungId),
    index("ix_required_doc_project_id").on(table.projectId),
    index("ix_required_doc_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.gsPruefungId, table.projectVersion],
      foreignColumns: [gsPruefung.id, gsPruefung.projectVersion],
      name: "required_doc_gs_pruefung_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "required_doc_pkey" }),
  ],
);

export const sollDokument = pgTable(
  "soll_dokument",
  {
    ivPruefungId: uuid("iv_pruefung_id").notNull(),
    docType: varchar("doc_type").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_soll_dokument_iv_pruefung_id").on(table.ivPruefungId),
    index("ix_soll_dokument_project_id").on(table.projectId),
    index("ix_soll_dokument_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.ivPruefungId, table.projectVersion],
      foreignColumns: [ivPruefung.id, ivPruefung.projectVersion],
      name: "soll_dokument_iv_pruefung_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "soll_dokument_pkey" }),
  ],
);

export const verwaltungsaktentwurfTeil = pgTable(
  "verwaltungsaktentwurf_teil",
  {
    bewertungId: uuid("bewertung_id").notNull(),
    text: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_verwaltungsaktentwurf_teil_bewertung_id").on(table.bewertungId),
    index("ix_verwaltungsaktentwurf_teil_project_id").on(table.projectId),
    index("ix_verwaltungsaktentwurf_teil_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.bewertungId, table.projectVersion],
      foreignColumns: [bewertung.id, bewertung.projectVersion],
      name: "verwaltungsaktentwurf_teil_bewertung_id_fkey",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.id, table.projectVersion],
      name: "verwaltungsaktentwurf_teil_pkey",
    }),
  ],
);

export const adressat = pgTable(
  "adressat",
  {
    rechtsfolgeId: uuid("rechtsfolge_id").notNull(),
    entscheidung: varchar().$type<Static<typeof RechtsfolgenAdressat>>().notNull(),
    reasoning: text(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_adressat_project_id").on(table.projectId),
    index("ix_adressat_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_adressat_rechtsfolge_id").on(table.rechtsfolgeId),
    foreignKey({
      columns: [table.rechtsfolgeId, table.projectVersion],
      foreignColumns: [rechtsfolge.id, rechtsfolge.projectVersion],
      name: "adressat_rechtsfolge_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "adressat_pkey" }),
  ],
);

export const auslegungsvorschlag = pgTable(
  "auslegungsvorschlag",
  {
    unbestimmterRechtsbegriffId: uuid("unbestimmter_rechtsbegriff_id").notNull(),
    methode: varchar().notNull(),
    text: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_auslegungsvorschlag_project_id").on(table.projectId),
    index("ix_auslegungsvorschlag_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_auslegungsvorschlag_unbestimmter_rechtsbegriff_id").on(
      table.unbestimmterRechtsbegriffId,
    ),
    foreignKey({
      columns: [table.unbestimmterRechtsbegriffId, table.projectVersion],
      foreignColumns: [unbestimmterRechtsbegriff.id, unbestimmterRechtsbegriff.projectVersion],
      name: "auslegungsvorschlag_unbestimmter_rechtsbegriff_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "auslegungsvorschlag_pkey" }),
  ],
);

export const absatz = pgTable(
  "absatz",
  {
    normId: uuid("norm_id").notNull(),
    absatzNr: varchar("absatz_nr").notNull(),
    text: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_absatz_norm_id").on(table.normId),
    index("ix_absatz_project_id").on(table.projectId),
    index("ix_absatz_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.normId, table.projectVersion],
      foreignColumns: [norm.id, norm.projectVersion],
      name: "absatz_norm_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "absatz_pkey" }),
  ],
);

export const ermessensspielraum = pgTable(
  "ermessensspielraum",
  {
    rechtsfolgeId: uuid("rechtsfolge_id").notNull(),
    entscheidung: varchar().$type<Static<typeof Ermessensspielraum>>().notNull(),
    reasoning: text(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_ermessensspielraum_project_id").on(table.projectId),
    index("ix_ermessensspielraum_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_ermessensspielraum_rechtsfolge_id").on(table.rechtsfolgeId),
    foreignKey({
      columns: [table.rechtsfolgeId, table.projectVersion],
      foreignColumns: [rechtsfolge.id, rechtsfolge.projectVersion],
      name: "ermessensspielraum_rechtsfolge_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "ermessensspielraum_pkey" }),
  ],
);

export const ermessensart = pgTable(
  "ermessensart",
  {
    rechtsfolgeId: uuid("rechtsfolge_id").notNull(),
    art: varchar().$type<Static<typeof ErmessensArt>>().notNull(),
    reasoning: text(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_ermessensart_project_id").on(table.projectId),
    index("ix_ermessensart_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_ermessensart_rechtsfolge_id").on(table.rechtsfolgeId),
    foreignKey({
      columns: [table.rechtsfolgeId, table.projectVersion],
      foreignColumns: [rechtsfolge.id, rechtsfolge.projectVersion],
      name: "ermessensart_rechtsfolge_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "ermessensart_pkey" }),
  ],
);

export const normvorschlag = pgTable(
  "normvorschlag",
  {
    normId: uuid("norm_id").notNull(),
    reason: text().notNull(),
    confidence: doublePrecision().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_normvorschlag_norm_id").on(table.normId),
    index("ix_normvorschlag_project_id").on(table.projectId),
    index("ix_normvorschlag_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.normId, table.projectVersion],
      foreignColumns: [norm.id, norm.projectVersion],
      name: "normvorschlag_norm_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "normvorschlag_pkey" }),
  ],
);

export const sollensanordnungen = pgTable(
  "sollensanordnungen",
  {
    rechtsfolgeId: uuid("rechtsfolge_id").notNull(),
    kategorie: varchar().$type<Static<typeof Sollensanordnungen>>().notNull(),
    reasoning: text(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_sollensanordnungen_project_id").on(table.projectId),
    index("ix_sollensanordnungen_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_sollensanordnungen_rechtsfolge_id").on(table.rechtsfolgeId),
    foreignKey({
      columns: [table.rechtsfolgeId, table.projectVersion],
      foreignColumns: [rechtsfolge.id, rechtsfolge.projectVersion],
      name: "sollensanordnungen_rechtsfolge_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "sollensanordnungen_pkey" }),
  ],
);

export const subChunkRelation = pgTable(
  "sub_chunk_relation",
  {
    fromSubChunkId: uuid("from_sub_chunk_id").notNull(),
    toSubChunkId: uuid("to_sub_chunk_id").notNull(),
    relationType: varchar("relation_type").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_sub_chunk_relation_from_sub_chunk_id").on(table.fromSubChunkId),
    index("ix_sub_chunk_relation_project_id").on(table.projectId),
    index("ix_sub_chunk_relation_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_sub_chunk_relation_to_sub_chunk_id").on(table.toSubChunkId),
    foreignKey({
      columns: [table.fromSubChunkId, table.projectVersion],
      foreignColumns: [subChunk.id, subChunk.projectVersion],
      name: "sub_chunk_relation_from_sub_chunk_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.toSubChunkId, table.projectVersion],
      foreignColumns: [subChunk.id, subChunk.projectVersion],
      name: "sub_chunk_relation_to_sub_chunk_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "sub_chunk_relation_pkey" }),
  ],
);

export const technischeNorm = pgTable(
  "technische_norm",
  {
    atomaresTbmId: uuid("atomares_tbm_id").notNull(),
    name: varchar().notNull(),
    confidence: doublePrecision().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_technische_norm_atomares_tbm_id").on(table.atomaresTbmId),
    index("ix_technische_norm_project_id").on(table.projectId),
    index("ix_technische_norm_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.atomaresTbmId, table.projectVersion],
      foreignColumns: [atomaresTbm.id, atomaresTbm.projectVersion],
      name: "technische_norm_atomares_tbm_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "technische_norm_pkey" }),
  ],
);

export const technischeNormEntry = pgTable(
  "technische_norm_entry",
  {
    technischeNormId: uuid("technische_norm_id").notNull(),
    entryId: varchar("entry_id").notNull(),
    kurzbeschreibung: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_technische_norm_entry_project_id").on(table.projectId),
    index("ix_technische_norm_entry_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_technische_norm_entry_technische_norm_id").on(table.technischeNormId),
    foreignKey({
      columns: [table.technischeNormId, table.projectVersion],
      foreignColumns: [technischeNorm.id, technischeNorm.projectVersion],
      name: "technische_norm_entry_technische_norm_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "technische_norm_entry_pkey" }),
  ],
);

export const widerspruch = pgTable(
  "widerspruch",
  {
    dokumentId: uuid("dokument_id").notNull(),
    text: text().notNull(),
    severity: varchar().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_widerspruch_dokument_id").on(table.dokumentId),
    index("ix_widerspruch_project_id").on(table.projectId),
    index("ix_widerspruch_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.dokumentId, table.projectVersion],
      foreignColumns: [dokument.id, dokument.projectVersion],
      name: "widerspruch_dokument_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "widerspruch_pkey" }),
  ],
);

export const unbestimmterRechtsbegriff = pgTable(
  "unbestimmter_rechtsbegriff",
  {
    atomaresTbmId: uuid("atomares_tbm_id").notNull(),
    begriff: varchar().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
    auslegung: text().notNull(),
  },
  (table) => [
    index("ix_unbestimmter_rechtsbegriff_atomares_tbm_id").on(table.atomaresTbmId),
    index("ix_unbestimmter_rechtsbegriff_project_id").on(table.projectId),
    index("ix_unbestimmter_rechtsbegriff_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.atomaresTbmId, table.projectVersion],
      foreignColumns: [atomaresTbm.id, atomaresTbm.projectVersion],
      name: "unbestimmter_rechtsbegriff_atomares_tbm_id_fkey",
    }).onDelete("cascade"),
    primaryKey({
      columns: [table.id, table.projectVersion],
      name: "unbestimmter_rechtsbegriff_pkey",
    }),
  ],
);

export const atomaresTbm = pgTable(
  "atomares_tbm",
  {
    satzId: uuid("satz_id").notNull(),
    text: text().notNull(),
    prueffrage: text(),
    pruefgegenstand: text(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_atomares_tbm_project_id").on(table.projectId),
    index("ix_atomares_tbm_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_atomares_tbm_satz_id").on(table.satzId),
    foreignKey({
      columns: [table.satzId, table.projectVersion],
      foreignColumns: [satz.id, satz.projectVersion],
      name: "atomares_tbm_satz_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "atomares_tbm_pkey" }),
  ],
);

export const impliziterVerweis = pgTable(
  "impliziter_verweis",
  {
    rechtsfolgeId: uuid("rechtsfolge_id"),
    atomaresTbmId: uuid("atomares_tbm_id"),
    targetRef: varchar("target_ref"),
    rationale: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_impliziter_verweis_atomares_tbm_id").on(table.atomaresTbmId),
    index("ix_impliziter_verweis_project_id").on(table.projectId),
    index("ix_impliziter_verweis_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_impliziter_verweis_rechtsfolge_id").on(table.rechtsfolgeId),
    foreignKey({
      columns: [table.atomaresTbmId, table.projectVersion],
      foreignColumns: [atomaresTbm.id, atomaresTbm.projectVersion],
      name: "impliziter_verweis_atomares_tbm_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.rechtsfolgeId, table.projectVersion],
      foreignColumns: [rechtsfolge.id, rechtsfolge.projectVersion],
      name: "impliziter_verweis_rechtsfolge_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "impliziter_verweis_pkey" }),
    check(
      "chk_impliziter_verweis_one_parent",
      sql`(
CASE
    WHEN (rechtsfolge_id IS NOT NULL) THEN 1
    ELSE 0
END +
CASE
    WHEN (atomares_tbm_id IS NOT NULL) THEN 1
    ELSE 0
END) = 1`,
    ),
  ],
);

export const zusammenfassung = pgTable(
  "zusammenfassung",
  {
    dokumentId: uuid("dokument_id").notNull(),
    requiredDocId: uuid("required_doc_id"),
    sollDokumentId: uuid("soll_dokument_id"),
    text: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_zusammenfassung_dokument_id").on(table.dokumentId),
    index("ix_zusammenfassung_project_id").on(table.projectId),
    index("ix_zusammenfassung_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_zusammenfassung_required_doc_id").on(table.requiredDocId),
    index("ix_zusammenfassung_soll_dokument_id").on(table.sollDokumentId),
    foreignKey({
      columns: [table.dokumentId, table.projectVersion],
      foreignColumns: [dokument.id, dokument.projectVersion],
      name: "zusammenfassung_dokument_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.requiredDocId, table.projectVersion],
      foreignColumns: [requiredDoc.id, requiredDoc.projectVersion],
      name: "zusammenfassung_required_doc_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sollDokumentId, table.projectVersion],
      foreignColumns: [sollDokument.id, sollDokument.projectVersion],
      name: "zusammenfassung_soll_dokument_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "zusammenfassung_pkey" }),
  ],
);

export const bewertung = pgTable(
  "bewertung",
  {
    satzId: uuid("satz_id").notNull(),
    result: varchar().notNull(),
    kurzform: text(),
    norm: text().notNull(),
    markdownTextId: uuid("markdown_text_id").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
  },
  (table) => [
    index("ix_bewertung_markdown_text_id").on(table.markdownTextId),
    index("ix_bewertung_project_id").on(table.projectId),
    index("ix_bewertung_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_bewertung_satz_id").on(table.satzId),
    foreignKey({
      columns: [table.markdownTextId, table.projectVersion],
      foreignColumns: [markdownText.id, markdownText.projectVersion],
      name: "bewertung_markdown_text_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.satzId, table.projectVersion],
      foreignColumns: [satz.id, satz.projectVersion],
      name: "bewertung_satz_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "bewertung_pkey" }),
  ],
);

/** Lockstep with AOS `BewertungKapitelInsertPayloadSchema` in assessment-contracts.ts. */
export const bewertungKapitel = pgTable(
  "bewertung_kapitel",
  {
    bewertungId: uuid("bewertung_id").notNull(),
    titel: text().notNull(),
    markdown: text().notNull(),
    kurzform: text(),
    order: integer().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_bewertung_kapitel_bewertung_id").on(table.bewertungId),
    index("ix_bewertung_kapitel_project_id").on(table.projectId),
    index("ix_bewertung_kapitel_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.bewertungId, table.projectVersion],
      foreignColumns: [bewertung.id, bewertung.projectVersion],
      name: "bewertung_kapitel_bewertung_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "bewertung_kapitel_pkey" }),
  ],
);

export const legaldefinition = pgTable(
  "legaldefinition",
  {
    bestimmterRechtsbegriffId: uuid("bestimmter_rechtsbegriff_id").notNull(),
    begriff: varchar().notNull(),
    definition: text().notNull(),
    sourceJurabk: varchar("source_jurabk"),
    sourceParagraphNr: varchar("source_paragraph_nr"),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_legaldefinition_bestimmter_rechtsbegriff_id").on(table.bestimmterRechtsbegriffId),
    index("ix_legaldefinition_project_id").on(table.projectId),
    index("ix_legaldefinition_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.bestimmterRechtsbegriffId, table.projectVersion],
      foreignColumns: [bestimmterRechtsbegriff.id, bestimmterRechtsbegriff.projectVersion],
      name: "legaldefinition_bestimmter_rechtsbegriff_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "legaldefinition_pkey" }),
  ],
);

export const norm = pgTable(
  "norm",
  {
    gesetzId: uuid("gesetz_id").notNull(),
    paragraphNr: varchar("paragraph_nr").notNull(),
    paragraphTitel: text("paragraph_titel"),
    text: text().notNull(),
    regelungsgegenstand: text(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_norm_gesetz_id").on(table.gesetzId),
    index("ix_norm_project_id").on(table.projectId),
    index("ix_norm_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    uniqueIndex("uq_norm_project_id_gesetz_id_paragraph_nr")
      .on(table.projectId, table.projectVersion, table.gesetzId, table.paragraphNr)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.gesetzId, table.projectVersion],
      foreignColumns: [gesetz.id, gesetz.projectVersion],
      name: "norm_gesetz_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "norm_pkey" }),
  ],
);

export const standangabe = pgTable(
  "standangabe",
  {
    gesetzId: uuid("gesetz_id").notNull(),
    standtyp: varchar().notNull(),
    standkommentar: text().notNull(),
    doknr: varchar(),
    externalId: integer("external_id"),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_standangabe_gesetz_id").on(table.gesetzId),
    index("ix_standangabe_project_id").on(table.projectId),
    index("ix_standangabe_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.gesetzId, table.projectVersion],
      foreignColumns: [gesetz.id, gesetz.projectVersion],
      name: "standangabe_gesetz_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "standangabe_pkey" }),
  ],
);

export const zugeordnetesDokument = pgTable(
  "zugeordnetes_dokument",
  {
    dokumentId: uuid("dokument_id").notNull(),
    requiredDocId: uuid("required_doc_id"),
    sollDokumentId: uuid("soll_dokument_id"),
    sourceDocumentId: uuid("source_document_id").notNull(),
    matchScore: doublePrecision("match_score").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_zugeordnetes_dokument_dokument_id").on(table.dokumentId),
    index("ix_zugeordnetes_dokument_project_id").on(table.projectId),
    index("ix_zugeordnetes_dokument_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_zugeordnetes_dokument_required_doc_id").on(table.requiredDocId),
    index("ix_zugeordnetes_dokument_soll_dokument_id").on(table.sollDokumentId),
    foreignKey({
      columns: [table.dokumentId, table.projectVersion],
      foreignColumns: [dokument.id, dokument.projectVersion],
      name: "zugeordnetes_dokument_dokument_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.requiredDocId, table.projectVersion],
      foreignColumns: [requiredDoc.id, requiredDoc.projectVersion],
      name: "zugeordnetes_dokument_required_doc_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.sollDokumentId, table.projectVersion],
      foreignColumns: [sollDokument.id, sollDokument.projectVersion],
      name: "zugeordnetes_dokument_soll_dokument_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "zugeordnetes_dokument_pkey" }),
    check(
      "chk_zugeordnetes_one_parent",
      sql`(
CASE
    WHEN (required_doc_id IS NOT NULL) THEN 1
    ELSE 0
END +
CASE
    WHEN (soll_dokument_id IS NOT NULL) THEN 1
    ELSE 0
END) = 1`,
    ),
  ],
);

/** Lockstep with AOS `BewertungQuelleInsertPayloadSchema` in assessment-contracts.ts. */
export const bewertungQuelle = pgTable(
  "bewertung_quelle",
  {
    bewertungId: uuid("bewertung_id").notNull(),
    dokumentId: uuid("dokument_id").notNull(),
    fundstelleId: uuid("fundstelle_id"),
    title: text().notNull(),
    chunkIds: varchar("chunk_ids").array().notNull(),
    pageNumbers: integer("page_numbers").array().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    citedSvmId: varchar("cited_svm_id", { length: 10 }),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_bewertung_quelle_bewertung_id").on(table.bewertungId),
    index("ix_bewertung_quelle_dokument_id").on(table.dokumentId),
    index("ix_bewertung_quelle_fundstelle_id").on(table.fundstelleId),
    index("ix_bewertung_quelle_project_id").on(table.projectId),
    index("ix_bewertung_quelle_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.bewertungId, table.projectVersion],
      foreignColumns: [bewertung.id, bewertung.projectVersion],
      name: "bewertung_quelle_bewertung_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.dokumentId, table.projectVersion],
      foreignColumns: [dokument.id, dokument.projectVersion],
      name: "bewertung_quelle_dokument_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.fundstelleId, table.projectVersion],
      foreignColumns: [fundstelle.id, fundstelle.projectVersion],
      name: "bewertung_quelle_fundstelle_id_fkey",
    }).onDelete("set null"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "bewertung_quelle_pkey" }),
  ],
);

export const subChunkImage = pgTable(
  "sub_chunk_image",
  {
    subChunkId: uuid("sub_chunk_id").notNull(),
    assetPath: varchar("asset_path").notNull(),
    caption: text().notNull(),
    summary: text().notNull(),
    description: text().notNull(),
    content: text().notNull(),
    footnote: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_sub_chunk_image_project_id").on(table.projectId),
    index("ix_sub_chunk_image_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_sub_chunk_image_sub_chunk_id").on(table.subChunkId),
    foreignKey({
      columns: [table.subChunkId, table.projectVersion],
      foreignColumns: [subChunk.id, subChunk.projectVersion],
      name: "sub_chunk_image_sub_chunk_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "sub_chunk_image_pkey" }),
  ],
);

export const subChunkTable = pgTable(
  "sub_chunk_table",
  {
    subChunkId: uuid("sub_chunk_id").notNull(),
    assetPath: varchar("asset_path").notNull(),
    caption: text().notNull(),
    summary: text().notNull(),
    description: text().notNull(),
    content: text().notNull(),
    footnote: text().notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_sub_chunk_table_project_id").on(table.projectId),
    index("ix_sub_chunk_table_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_sub_chunk_table_sub_chunk_id").on(table.subChunkId),
    foreignKey({
      columns: [table.subChunkId, table.projectVersion],
      foreignColumns: [subChunk.id, subChunk.projectVersion],
      name: "sub_chunk_table_sub_chunk_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "sub_chunk_table_pkey" }),
  ],
);

/** Lockstep with AOS `FundstelleContextSchema` / fundstelle insert payloads in agent_orchestration_service. */
export const fundstelle = pgTable(
  "fundstelle",
  {
    sourceNodeId: text("source_node_id"),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    dokumentId: uuid("dokument_id").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    satzId: uuid("satz_id").notNull(),
    gesetzId: uuid("gesetz_id").notNull(),
    normId: uuid("norm_id").notNull(),
    title: text().notNull(),
    text: text().notNull(),
    pageNumbers: integer("page_numbers").array().default([]).notNull(),
    chunkIds: uuid("chunk_ids").array().default([]).notNull(),
    confidence: doublePrecision(),
    consensusRatio: doublePrecision("consensus_ratio"),
    relevance: doublePrecision(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
  },
  (table) => [
    index("ix_fundstelle_dokument_id").on(table.dokumentId),
    index("ix_fundstelle_gesetz_id").on(table.gesetzId),
    index("ix_fundstelle_norm_id").on(table.normId),
    index("ix_fundstelle_project_id").on(table.projectId),
    index("ix_fundstelle_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_fundstelle_satz_id").on(table.satzId),
    foreignKey({
      columns: [table.dokumentId, table.projectVersion],
      foreignColumns: [dokument.id, dokument.projectVersion],
      name: "fundstelle_dokument_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.gesetzId, table.projectVersion],
      foreignColumns: [gesetz.id, gesetz.projectVersion],
      name: "fundstelle_gesetz_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.normId, table.projectVersion],
      foreignColumns: [norm.id, norm.projectVersion],
      name: "fundstelle_norm_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.satzId, table.projectVersion],
      foreignColumns: [satz.id, satz.projectVersion],
      name: "fundstelle_satz_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "fundstelle_pkey" }),
    check(
      "chk_fundstelle_scores_in_range",
      sql`(confidence IS NULL OR confidence BETWEEN 0 AND 1)
AND (consensus_ratio IS NULL OR consensus_ratio BETWEEN 0 AND 1)
AND (relevance IS NULL OR relevance BETWEEN 0 AND 1)`,
    ),
  ],
);

/** Lockstep with AOS document node payloads in agent_orchestration_service extraction.ts. */
export const dokument = pgTable(
  "dokument",
  {
    filename: varchar().notNull(),
    mimeType: varchar("mime_type").notNull(),
    pageCount: integer("page_count").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    dmsFileId: uuid("dms_file_id").notNull(),
    documentType: varchar("document_type"),
    summary: text().notNull(),
    markdownTextId: uuid("markdown_text_id").notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    documentId: varchar("document_id"),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isTocDocument: boolean("is_toc_document").default(false).notNull(),
  },
  (table) => [
    index("ix_dokument_markdown_text_id").on(table.markdownTextId),
    index("ix_dokument_project_id").on(table.projectId),
    index("ix_dokument_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.markdownTextId, table.projectVersion],
      foreignColumns: [markdownText.id, markdownText.projectVersion],
      name: "dokument_markdown_text_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "dokument_pkey" }),
  ],
);

export const expliziterVerweis = pgTable(
  "expliziter_verweis",
  {
    rechtsfolgeId: uuid("rechtsfolge_id"),
    atomaresTbmId: uuid("atomares_tbm_id"),
    gesetz: varchar(),
    paragraphNr: varchar("paragraph_nr"),
    absatzNr: varchar("absatz_nr"),
    satzNr: varchar("satz_nr"),
    untergliederung: json(),
    verweisTyp: varchar("verweis_typ"),
    kontext: json(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_expliziter_verweis_atomares_tbm_id").on(table.atomaresTbmId),
    index("ix_expliziter_verweis_project_id").on(table.projectId),
    index("ix_expliziter_verweis_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    index("ix_expliziter_verweis_rechtsfolge_id").on(table.rechtsfolgeId),
    foreignKey({
      columns: [table.atomaresTbmId, table.projectVersion],
      foreignColumns: [atomaresTbm.id, atomaresTbm.projectVersion],
      name: "expliziter_verweis_atomares_tbm_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.rechtsfolgeId, table.projectVersion],
      foreignColumns: [rechtsfolge.id, rechtsfolge.projectVersion],
      name: "expliziter_verweis_rechtsfolge_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "expliziter_verweis_pkey" }),
    check(
      "chk_expliziter_verweis_one_parent",
      sql`(
CASE
    WHEN (rechtsfolge_id IS NOT NULL) THEN 1
    ELSE 0
END +
CASE
    WHEN (atomares_tbm_id IS NOT NULL) THEN 1
    ELSE 0
END) = 1`,
    ),
  ],
);

export const satz = pgTable(
  "satz",
  {
    lastSuzResultId: uuid("last_suz_result_id"),
    absatzId: uuid("absatz_id").notNull(),
    satzNr: varchar("satz_nr").notNull(),
    text: text().notNull(),
    normTypLvl1: varchar("norm_typ_lvl_1"),
    normTypLvl2: varchar("norm_typ_lvl_2"),
    tatbestandsmerkmale: json().$type<string[]>(),
    formel: text(),
    wennDann: text("wenn_dann"),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    markers: text().array().default([]).notNull(),
    position: integer(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_satz_absatz_id").on(table.absatzId),
    index("ix_satz_project_id").on(table.projectId),
    index("ix_satz_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.absatzId, table.projectVersion],
      foreignColumns: [absatz.id, absatz.projectVersion],
      name: "satz_absatz_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "satz_pkey" }),
  ],
);

export const chunk = pgTable(
  "chunk",
  {
    dokumentId: uuid("dokument_id").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    header: text().notNull(),
    pageNumbers: integer("page_numbers").array().notNull(),
    tocPath: varchar("toc_path").array().notNull(),
    allSubchapters: varchar("all_subchapters").array().notNull(),
    order: integer().notNull(),
    nextChunkId: uuid("next_chunk_id"),
    previousChunkId: uuid("previous_chunk_id"),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    pageIndexNodeId: varchar("page_index_node_id"),
    pageIndexPosition: integer("page_index_position"),
    pageIndexSummary: text("page_index_summary"),
    pageContent: text("page_content").default("").notNull(),
    hypotheticalQuestions: varchar("hypothetical_questions").array().default([]).notNull(),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_chunk_dokument_id").on(table.dokumentId),
    index("ix_chunk_project_id").on(table.projectId),
    index("ix_chunk_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.dokumentId, table.projectVersion],
      foreignColumns: [dokument.id, dokument.projectVersion],
      name: "chunk_dokument_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "chunk_pkey" }),
  ],
);

export const subChunk = pgTable(
  "sub_chunk",
  {
    chunkId: uuid("chunk_id").notNull(),
    header: text().notNull(),
    chunkType: varchar("chunk_type").notNull(),
    focusTopic: text("focus_topic").notNull(),
    hypotheticalQuestions: varchar("hypothetical_questions").array().notNull(),
    order: integer().notNull(),
    nextSubChunkId: uuid("next_sub_chunk_id"),
    previousSubChunkId: uuid("previous_sub_chunk_id"),
    markdownTextId: uuid("markdown_text_id").notNull(),
    id: uuid().notNull(),
    projectId: uuid("project_id").notNull(),
    isDeleted: boolean("is_deleted").default(false).notNull(),
    frontendParentIds: varchar("frontend_parent_ids").array().default([]).notNull(),
    updateType: updateType("update_type").default("AUTOMATED"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    pageNumbers: integer("page_numbers").array().default([]).notNull(),
    header1: text("header_1"),
    header2: text("header_2"),
    header3: text("header_3"),
    wildlifeMentioned: boolean("wildlife_mentioned"),
    plantSpeciesMentioned: boolean("plant_species_mentioned"),
    wildlifeSpecies: varchar("wildlife_species").array().default([]).notNull(),
    plantSpecies: varchar("plant_species").array().default([]).notNull(),
    mapScale: varchar("map_scale"),
    sysPeriod: timestampRange("sys_period")
      .default(sql`tstzrange(CURRENT_TIMESTAMP, null)`)
      .notNull(),
    projectVersion: integer("project_version").default(1).notNull(),
    isOutdated: boolean("is_outdated").default(false).notNull(),
  },
  (table) => [
    index("ix_sub_chunk_chunk_id").on(table.chunkId),
    index("ix_sub_chunk_markdown_text_id").on(table.markdownTextId),
    index("ix_sub_chunk_project_id").on(table.projectId),
    index("ix_sub_chunk_project_id_active")
      .on(table.projectId, table.projectVersion)
      .where(sql`(is_deleted IS FALSE)`),
    foreignKey({
      columns: [table.chunkId, table.projectVersion],
      foreignColumns: [chunk.id, chunk.projectVersion],
      name: "sub_chunk_chunk_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.markdownTextId, table.projectVersion],
      foreignColumns: [markdownText.id, markdownText.projectVersion],
      name: "sub_chunk_markdown_text_id_fkey",
    }).onDelete("cascade"),
    primaryKey({ columns: [table.id, table.projectVersion], name: "sub_chunk_pkey" }),
  ],
);

const examinationHistoryTables = {
  absatzHistory,
  adressatHistory,
  atomaresTbmHistory,
  auslegungsvorschlagHistory,
  bestimmterRechtsbegriffHistory,
  bewertungHistory,
  bewertungKapitelHistory,
  bewertungQuelleHistory,
  chunkHistory,
  dokumentHistory,
  ermessensartHistory,
  ermessensspielraumHistory,
  expliziterVerweisHistory,
  fundstelleHistory,
  gesetzHistory,
  gsPruefungHistory,
  impliziterVerweisHistory,
  ivPruefungHistory,
  legaldefinitionHistory,
  markdownTextHistory,
  normDeconstructionHistory,
  normHistory,
  normDeconstruction,
  normvorschlagHistory,
  examinationProjectHistory,
  rechtsfolgeHistory,
  requiredDocHistory,
  satzHistory,
  sollDokumentHistory,
  sollensanordnungenHistory,
  standangabeHistory,
  subChunkHistory,
  subChunkImageHistory,
  subChunkRelationHistory,
  subChunkTableHistory,
  subChunkTextHistory,
  technischeNormEntryHistory,
  technischeNormHistory,
  unbestimmterRechtsbegriffHistory,
  verwaltungsaktentwurfTeilHistory,
  widerspruchHistory,
  zugeordnetesDokumentHistory,
  zusammenfassungHistory,
};

export const examinationNodeTables = {
  project,
  ivPruefung,
  markdownText,
  gsPruefung,
  subChunkText,
  bestimmterRechtsbegriff,
  gesetz,
  rechtsfolge,
  requiredDoc,
  sollDokument,
  verwaltungsaktentwurfTeil,
  adressat,
  auslegungsvorschlag,
  absatz,
  ermessensspielraum,
  ermessensart,
  normvorschlag,
  sollensanordnungen,
  subChunkRelation,
  technischeNorm,
  technischeNormEntry,
  widerspruch,
  unbestimmterRechtsbegriff,
  atomaresTbm,
  impliziterVerweis,
  zusammenfassung,
  bewertung,
  bewertungKapitel,
  legaldefinition,
  norm,
  standangabe,
  zugeordnetesDokument,
  bewertungQuelle,
  subChunkImage,
  subChunkTable,
  fundstelle,
  dokument,
  expliziterVerweis,
  satz,
  chunk,
  subChunk,
};

export const examinationTables = { ...examinationHistoryTables, ...examinationNodeTables };
export const examinationSchema = examinationTables;
export type ExaminationNode<Key extends keyof typeof examinationNodeTables> = {
  [NodeKey in Key]: (typeof examinationNodeTables)[NodeKey]["$inferSelect"] & {
    nodeType: (typeof examinationNodeTables)[NodeKey]["_"]["name"];
  };
}[Key];

export type ExaminationSchema = typeof examinationSchema;
