import type { ProtocolSource } from "./history/types.ts";

export interface ProtocolSourceDefinition {
  readonly source: ProtocolSource;
  readonly tables: readonly {
    readonly name: string;
    readonly projectColumn: string;
  }[];
}

export const protocolSourceDefinitions = [
  {
    source: "project_logic",
    tables: [
      { name: "project", projectColumn: "id" },
      { name: "applicant", projectColumn: "project_id" },
      { name: "topic", projectColumn: "project_id" },
      { name: "topic_norm", projectColumn: "project_id" },
      { name: "deadline", projectColumn: "project_id" },
    ],
  },
  {
    source: "formal_completeness",
    tables: [
      { name: "category", projectColumn: "project_id" },
      { name: "document", projectColumn: "project_id" },
      { name: "document_type", projectColumn: "project_id" },
      { name: "table_of_content_notes", projectColumn: "project_id" },
    ],
  },
  { source: "comment", tables: [{ name: "comment", projectColumn: "project_id" }] },
  {
    source: "supplementary",
    tables: [{ name: "supplementary_request", projectColumn: "project_id" }],
  },
  {
    source: "plausibility",
    tables: [{ name: "plausibility_note", projectColumn: "project_id" }],
  },
  {
    source: "document_management",
    tables: [
      { name: "file", projectColumn: "project_id" },
      { name: "zip_file", projectColumn: "project_id" },
    ],
  },
  {
    source: "administrative_draft",
    tables: [
      { name: "risks", projectColumn: "project_id" },
      { name: "vae_node", projectColumn: "project_id" },
    ],
  },
  {
    source: "examination",
    tables: [
      { name: "gesetz", projectColumn: "project_id" },
      { name: "norm", projectColumn: "project_id" },
      { name: "bewertung", projectColumn: "project_id" },
      { name: "bewertung_kapitel", projectColumn: "project_id" },
      { name: "dokument", projectColumn: "project_id" },
      { name: "fundstelle", projectColumn: "project_id" },
    ],
  },
  {
    source: "objections_management",
    tables: [
      { name: "beteiligungs_eingang", projectColumn: "project_id" },
      { name: "argument", projectColumn: "project_id" },
    ],
  },
] satisfies readonly ProtocolSourceDefinition[];
