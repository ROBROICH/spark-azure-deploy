import { Type, type Static } from "@sinclair/typebox";

import type { WorkflowName } from "../registry.js";

export const NORMENERMITTLUNG_TASK_QUEUE = "normermittlung" as const;
export const NORMENERMITTLUNG_WORKFLOW =
  "NormenPipelineWorkflow" as WorkflowName<"NormenPipelineWorkflow">;

const nullableString = Type.Union([Type.String(), Type.Null()], { default: null });
const normInput = Type.Object(
  {
    jurabk: Type.String(),
    paragraphNr: Type.String(),
    text: Type.String(),
    hierarchy: Type.String(),
    bundesland: Type.Optional(nullableString),
    ausfertigungDatum: Type.Optional(nullableString),
    neufassungDatum: Type.Optional(nullableString),
    letzteAenderungDatum: Type.Optional(nullableString),
    regelungsgegenstand: Type.Optional(nullableString),
  },
  { $id: "NormInput" },
);
const normEvalResult = Type.Object(
  {
    normId: Type.String(),
    jurabk: Type.String(),
    paragraphNr: Type.String(),
    applicable: Type.Boolean(),
    reason: Type.Optional(Type.String({ default: "" })),
    text: Type.Optional(Type.String({ default: "" })),
    hierarchy: Type.Optional(Type.String({ default: "" })),
    location: Type.Optional(Type.String({ default: "" })),
    regelungsgegenstand: Type.Optional(Type.String({ default: "" })),
    effectiveDate: Type.Optional(nullableString),
    neufassungDatum: Type.Optional(nullableString),
    letzteAenderungDatum: Type.Optional(nullableString),
    sachverhaltText: Type.Optional(Type.String({ default: "" })),
    sachverhaltId: Type.Optional(Type.String({ default: "" })),
  },
  { $id: "NormEvalResult" },
);
const collisionPairResult = Type.Object(
  {
    norm1Id: Type.String(),
    norm2Id: Type.String(),
    winnerNormId: Type.Optional(nullableString),
    loserNormId: Type.Optional(nullableString),
    collisionType: Type.Optional(nullableString),
    reason: Type.Optional(Type.String({ default: "" })),
    log: Type.Optional(Type.String({ default: "" })),
  },
  { $id: "CollisionPairResult" },
);
const collisionResult = Type.Object(
  {
    resolvedCollisions: Type.Optional(Type.Array(Type.Ref(collisionPairResult), { default: [] })),
    collisionCount: Type.Optional(Type.Integer({ default: 0 })),
    totalPairsChecked: Type.Optional(Type.Integer({ default: 0 })),
    loserNormIds: Type.Optional(Type.Array(Type.String(), { default: [] })),
  },
  { $id: "CollisionResult" },
);
const normErmittlungInput = Type.Object(
  {
    projectId: Type.String(),
    norms: Type.Array(Type.Ref(normInput), { minItems: 1 }),
    place: Type.String(),
    date: Type.String(),
  },
  { $id: "NormErmittlungInput" },
);
const normSelectionResult = Type.Object(
  {
    applicableNorms: Type.Optional(Type.Array(Type.Ref(normEvalResult), { default: [] })),
    totalNormsEvaluated: Type.Optional(Type.Integer({ default: 0 })),
    totalLawsFiltered: Type.Optional(Type.Integer({ default: 0 })),
    collisionResult: Type.Optional(
      Type.Union([Type.Ref(collisionResult), Type.Null()], { default: null }),
    ),
    finalNorms: Type.Optional(Type.Array(Type.Ref(normEvalResult), { default: [] })),
  },
  { $id: "NormSelectionResult" },
);

const contracts = Type.Module({
  NormInput: normInput,
  NormEvalResult: normEvalResult,
  CollisionPairResult: collisionPairResult,
  CollisionResult: collisionResult,
  NormErmittlungInput: normErmittlungInput,
  NormSelectionResult: normSelectionResult,
});

export const NormInput = contracts.Import("NormInput");
export const NormEvalResult = contracts.Import("NormEvalResult");
export const CollisionPairResult = contracts.Import("CollisionPairResult");
export const CollisionResult = contracts.Import("CollisionResult");
export const NormErmittlungInput = contracts.Import("NormErmittlungInput");
export const NormSelectionResult = contracts.Import("NormSelectionResult");

export type NormInput = Static<typeof normInput>;
export type NormEvalResult = Static<typeof normEvalResult>;
export type CollisionPairResult = Static<typeof collisionPairResult>;
export type CollisionResult = Static<typeof collisionResult>;
export type NormErmittlungInput = Static<typeof normErmittlungInput>;
export type NormSelectionResult = Static<typeof normSelectionResult>;
