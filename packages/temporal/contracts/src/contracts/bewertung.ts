import { Type, type Static } from "@sinclair/typebox";

import { GeneratedUUID, type WorkflowName } from "../registry.js";
import { AtomaresTBM, Rechtsfolge } from "./rechtsmethodik.js";

export const BEWERTUNG_TASK_QUEUE = "bewertung" as const;
export const BEWERTUNG_WORKFLOW = "bewertungs_workflow" as WorkflowName<"bewertungs_workflow">;

const originaltext = Type.Object(
  {
    documentId: Type.String(),
    nodeId: Type.String(),
    title: Type.String(),
    text: Type.String(),
    chunkIds: Type.Optional(Type.Array(Type.String(), { default: [] })),
    pageNumbers: Type.Optional(Type.Array(Type.Integer(), { default: [] })),
  },
  { $id: "Originaltext", additionalProperties: false },
);
const quelle = Type.Object(
  {
    documentId: Type.String(),
    nodeId: Type.String(),
    title: Type.String(),
    chunkIds: Type.Optional(Type.Array(Type.String(), { default: [] })),
    pageNumbers: Type.Optional(Type.Array(Type.Integer(), { default: [] })),
  },
  { $id: "Quelle", additionalProperties: false },
);
const kapitelOutput = Type.Object(
  {
    id: Type.Ref(GeneratedUUID),
    titel: Type.String(),
    markdown: Type.String(),
    kurzform: Type.Optional(Type.Union([Type.String(), Type.Null()], { default: null })),
  },
  { $id: "KapitelOutput", additionalProperties: false },
);
const bewertungsWorkflowInput = Type.Object(
  {
    gesetz: Type.String(),
    jurabk: Type.String(),
    paragraphNr: Type.String(),
    paragraphTitle: Type.String(),
    paragraphText: Type.String(),
    satzId: Type.String(),
    satzText: Type.String(),
    rechtsfolge: Type.Optional(Type.Union([Rechtsfolge, Type.Null()], { default: null })),
    atomareTbm: Type.Optional(
      Type.Union([Type.Array(AtomaresTBM), Type.Null()], { default: null }),
    ),
    researchReport: Type.Optional(Type.Union([Type.String(), Type.Null()], { default: null })),
    originaltexte: Type.Array(Type.Ref(originaltext), { minItems: 1 }),
  },
  { additionalProperties: false },
);
const bewertungsWorkflowOutput = Type.Object(
  {
    id: Type.Ref(GeneratedUUID),
    satzId: Type.String(),
    norm: Type.String(),
    satzText: Type.String(),
    result: Type.String(),
    kurzform: Type.Optional(Type.Union([Type.String(), Type.Null()], { default: null })),
    kapitel: Type.Array(Type.Ref(kapitelOutput)),
    fullText: Type.String(),
    sources: Type.Optional(Type.Record(Type.String(), Type.Ref(quelle), { default: {} })),
  },
  { additionalProperties: false },
);

const contracts = Type.Module({
  GeneratedUUID,
  Originaltext: originaltext,
  BewertungsWorkflowInput: bewertungsWorkflowInput,
  Quelle: quelle,
  KapitelOutput: kapitelOutput,
  BewertungsWorkflowOutput: bewertungsWorkflowOutput,
});

export const Originaltext = contracts.Import("Originaltext");
export const BewertungsWorkflowInput = contracts.Import("BewertungsWorkflowInput");
export const Quelle = contracts.Import("Quelle");
export const KapitelOutput = contracts.Import("KapitelOutput");
export const BewertungsWorkflowOutput = contracts.Import("BewertungsWorkflowOutput");

export type Originaltext = Static<typeof originaltext>;
export type BewertungsWorkflowInput = Static<typeof bewertungsWorkflowInput>;
export type Quelle = Static<typeof quelle>;
export type KapitelOutput = Static<typeof kapitelOutput>;
export type BewertungsWorkflowOutput = Static<typeof bewertungsWorkflowOutput>;
