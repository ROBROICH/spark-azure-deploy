import { type Static, Type as T } from "@sinclair/typebox";

export const protocolSources = [
  "project_logic",
  "formal_completeness",
  "comment",
  "supplementary",
  "plausibility",
  "document_management",
  "administrative_draft",
  "examination",
  "objections_management",
] as const;

export type ProtocolSource = (typeof protocolSources)[number];
export type HistorySource = "user" | "agent";
export type HistorySourceFilter = HistorySource | "all";
export type HistoryChangeType = "create" | "update" | "delete" | "action";

export const serviceLabels = {
  project_logic: "Verfahrensdaten",
  formal_completeness: "Formale Vollständigkeitsprüfung",
  comment: "Kommentare",
  supplementary: "Ergänzungsanfragen",
  plausibility: "Plausibilitätsprüfung",
  document_management: "Dokumente",
  administrative_draft: "Verwaltungsentwurf",
  examination: "Rechtliche Prüfung",
  objections_management: "Behörden- und Öffentlichkeitsbeteiligung",
} satisfies Readonly<Record<ProtocolSource, string>>;

export interface HistoryQuery {
  projectId: string;
  from: string | null;
  to: string | null;
  source: HistorySourceFilter | null;
  service: string | null;
  workflowRunId: string | null;
  requestId: string | null;
  collapsed: boolean;
  limit: number;
  offset: number;
}

export const HistoryItemSchema = T.Object(
  {
    timestamp: T.String(),
    entityType: T.String(),
    entityId: T.Union([T.String(), T.Null()]),
    service: T.Union([
      T.Literal("project_logic"),
      T.Literal("formal_completeness"),
      T.Literal("comment"),
      T.Literal("supplementary"),
      T.Literal("plausibility"),
      T.Literal("document_management"),
      T.Literal("administrative_draft"),
      T.Literal("examination"),
      T.Literal("objections_management"),
    ]),
    serviceLabel: T.String(),
    changeType: T.Union([
      T.Literal("create"),
      T.Literal("update"),
      T.Literal("delete"),
      T.Literal("action"),
    ]),
    source: T.Union([T.Literal("user"), T.Literal("agent")]),
    actorUserId: T.Union([T.String(), T.Null()]),
    triggeredByUserId: T.Union([T.String(), T.Null()]),
    workflowRunId: T.Union([T.String(), T.Null()]),
    workflowType: T.Union([T.String(), T.Null()]),
    actionType: T.Union([T.String(), T.Null()]),
    requestId: T.Union([T.String(), T.Null()]),
    oldRow: T.Union([T.Object({}, { additionalProperties: true }), T.Null()]),
    newRow: T.Union([T.Object({}, { additionalProperties: true }), T.Null()]),
    groupCount: T.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type HistoryItem = Static<typeof HistoryItemSchema>;

export const HistoryResponseSchema = T.Object(
  {
    total: T.Integer({
      minimum: 0,
      description: "Number of filtered groups for collapsed reads, or events for ungrouped reads.",
    }),
    limit: T.Integer({ minimum: 0 }),
    offset: T.Integer({ minimum: 0 }),
    items: T.Array(HistoryItemSchema),
  },
  { additionalProperties: false },
);
export type HistoryResponse = Static<typeof HistoryResponseSchema>;
