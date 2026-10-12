import { Type, type Static } from "@sinclair/typebox";

import type { WorkflowName } from "../registry.js";

export const PLAUSIBILITAET_TASK_QUEUE = "plausibilitaet-pruefung" as const;
export const PLAUSIBILITAET_WORKFLOW =
  "PlausibilityMainOrchestratorWorkflow" as WorkflowName<"PlausibilityMainOrchestratorWorkflow">;

const plausibilityStatus = Type.Union(
  [Type.Literal("OPEN"), Type.Literal("RESOLVED"), Type.Literal("IGNORED")],
  { $id: "PlausibilityStatus" },
);
const plausibilityConflictLocation = Type.Object(
  {
    gegenstand: Type.Optional(Type.String({ default: "" })),
    merkmal: Type.Optional(Type.String({ default: "" })),
    wert: Type.Optional(Type.String({ default: "" })),
  },
  { $id: "PlausibilityConflictLocation", additionalProperties: false },
);
const plausibilityContradictionOccurrence = Type.Object(
  {
    documentId: Type.String(),
    documentName: Type.Union([Type.String(), Type.Null()]),
    contentExcerpt: Type.String(),
    contradiction: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    pageNumber: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
  },
  { $id: "PlausibilityContradictionOccurrence", additionalProperties: false },
);
const plausibilityContradiction = Type.Object(
  {
    id: Type.String(),
    title: Type.Union([Type.String(), Type.Null()]),
    description: Type.String(),
    rating: Type.Optional(
      Type.Union([Type.Integer({ minimum: 0, maximum: 100 }), Type.Null()]),
    ),
    confidenceScore: Type.Optional(
      Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()]),
    ),
    scoreA: Type.Optional(
      Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()]),
    ),
    scoreB: Type.Optional(
      Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()]),
    ),
    evidence: Type.Optional(Type.Array(Type.String(), { default: [] })),
    mergedCount: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    conflict: Type.Optional(
      Type.Array(Type.Ref(plausibilityConflictLocation), { default: [] }),
    ),
    status: Type.Ref(plausibilityStatus),
    occurrences: Type.Optional(
      Type.Array(Type.Ref(plausibilityContradictionOccurrence), { default: [] }),
    ),
  },
  { $id: "PlausibilityContradiction", additionalProperties: false },
);
const plausibilityCheckResult = Type.Object(
  { contradictions: Type.Array(Type.Ref(plausibilityContradiction)) },
  { $id: "PlausibilityCheckResult", additionalProperties: false },
);

const contracts = Type.Module({
  PlausibilityOrchestratorInput: Type.Object({
    projectId: Type.String(),
    documentIds: Type.Array(Type.String()),
    erlaeuterungsberichtDocumentIds: Type.Optional(Type.Array(Type.String(), { default: [] })),
    classificationFileId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  }),
  PlausibilityStatus: plausibilityStatus,
  PlausibilityConflictLocation: plausibilityConflictLocation,
  PlausibilityContradictionOccurrence: plausibilityContradictionOccurrence,
  PlausibilityContradiction: plausibilityContradiction,
  PlausibilityCheckResult: plausibilityCheckResult,
});

export const PlausibilityOrchestratorInput = contracts.Import("PlausibilityOrchestratorInput");
export type PlausibilityOrchestratorInput = Static<typeof PlausibilityOrchestratorInput>;
export const PlausibilityStatus = contracts.Import("PlausibilityStatus");
export type PlausibilityStatus = Static<typeof plausibilityStatus>;
export const PlausibilityConflictLocation = contracts.Import("PlausibilityConflictLocation");
export type PlausibilityConflictLocation = Static<typeof plausibilityConflictLocation>;
export const PlausibilityContradictionOccurrence = contracts.Import(
  "PlausibilityContradictionOccurrence",
);
export type PlausibilityContradictionOccurrence = Static<
  typeof plausibilityContradictionOccurrence
>;
export const PlausibilityContradiction = contracts.Import("PlausibilityContradiction");
export type PlausibilityContradiction = Static<typeof plausibilityContradiction>;
export const PlausibilityCheckResult = contracts.Import("PlausibilityCheckResult");
export type PlausibilityCheckResult = Static<typeof plausibilityCheckResult>;
