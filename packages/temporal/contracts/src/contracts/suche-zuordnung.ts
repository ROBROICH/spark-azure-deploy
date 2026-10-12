import { type Static, Type } from "@sinclair/typebox";

import { UUID, type WorkflowName } from "../registry.js";
import { SourceSchema } from "./rechtsmethodik.js";

export const SUCHE_ZUORDNUNG_TASK_QUEUE = "modul-suche-und-zuordnung" as const;
export const SUCHE_ZUORDNUNG_SATZ_ORCHESTRATOR_WORKFLOW =
  "satz_orchestrator" as WorkflowName<"satz_orchestrator">;

const definition = Type.Object(
  {
    uuid: Type.Optional(Type.Union([Type.String(), Type.Null()], { default: null })),
    definition: Type.String(),
    source: Type.Optional(Type.Union([Type.Ref(SourceSchema), Type.Null()], { default: null })),
  },
  { $id: "SucheZuordnungDefinition", additionalProperties: false },
);
const bestimmterRechtsbegriff = Type.Object(
  {
    begriff: Type.String(),
    selectedDefinition: Type.Optional(Type.Union([Type.String(), Type.Null()], { default: null })),
    definitions: Type.Array(Type.Ref(definition)),
  },
  { $id: "SucheZuordnungBestimmterRechtsbegriff", additionalProperties: false },
);
const auslegungsvorschlag = Type.Object(
  { auslegungvorschlag: Type.String() },
  { $id: "SucheZuordnungAuslegungsvorschlag", additionalProperties: false },
);
const unbestimmterRechtsbegriff = Type.Object(
  {
    begriff: Type.String(),
    auslegungsvorschlaege: Type.Array(Type.Ref(auslegungsvorschlag)),
  },
  { $id: "SucheZuordnungUnbestimmterRechtsbegriff", additionalProperties: false },
);
const rechtsbegriffe = Type.Object(
  {
    bestimmteRechtsbegriffe: Type.Array(Type.Ref(bestimmterRechtsbegriff)),
    unbestimmteRechtsbegriffe: Type.Array(Type.Ref(unbestimmterRechtsbegriff)),
  },
  { $id: "SucheZuordnungRechtsbegriffe", additionalProperties: false },
);
const atomaresTbm = Type.Object(
  {
    id: Type.Optional(Type.Union([UUID, Type.Null()], { default: null })),
    prueffrage: Type.Union([Type.String(), Type.Null()]),
    rechtsbegriffe: Type.Union([Type.Ref(rechtsbegriffe), Type.Null()]),
  },
  { $id: "SucheZuordnungAtomaresTBM", additionalProperties: false },
);
const satz = Type.Object(
  {
    id: Type.Optional(Type.Union([Type.String(), Type.Null()], { default: null })),
    satzNr: Type.Union([Type.String(), Type.Integer()]),
    position: Type.Optional(Type.Union([Type.Integer(), Type.Null()], { default: null })),
    satzText: Type.String(),
    normTypLvl1: Type.Optional(Type.Union([Type.String(), Type.Null()], { default: null })),
    normTypLvl2: Type.Optional(Type.Union([Type.String(), Type.Null()], { default: null })),
    tatbestandsmerkmale: Type.Optional(Type.Array(Type.String(), { default: [] })),
    atomareTatbestandsmerkmale: Type.Optional(Type.Array(Type.Ref(atomaresTbm), { default: [] })),
  },
  { $id: "SucheZuordnungSatz", additionalProperties: false },
);
const absatz = Type.Object(
  {
    absatzNr: Type.Union([Type.String(), Type.Integer()]),
    absatzText: Type.String(),
    saetze: Type.Array(Type.Ref(satz)),
  },
  { $id: "SucheZuordnungAbsatz", additionalProperties: false },
);
const normData = Type.Object(
  {
    gesetz: Type.String(),
    jurabk: Type.String(),
    paragraph: Type.Optional(Type.Union([Type.String(), Type.Null()], { default: null })),
    paragraphNr: Type.String(),
    paragraphTitel: Type.String(),
    absaetze: Type.Array(Type.Ref(absatz)),
  },
  { $id: "SucheZuordnungNormData", additionalProperties: false },
);
const documentNode = Type.Object(
  {
    nodeId: Type.String(),
    title: Type.String(),
    text: Type.String(),
    summary: Type.String(),
    chunkIds: Type.Array(Type.String()),
    pageNumbers: Type.Optional(Type.Array(Type.Integer(), { default: [] })),
  },
  { $id: "SucheZuordnungDocumentNode", additionalProperties: false },
);
const document = Type.Object(
  {
    fileId: Type.String(),
    documentName: Type.String(),
    nodes: Type.Array(Type.Ref(documentNode)),
  },
  { $id: "SucheZuordnungDocument", additionalProperties: false },
);
// One normalized 0-to-1 score shared by every reliability signal below.
const score = Type.Number({ $id: "SucheZuordnungScore", minimum: 0, maximum: 1 });
const pageIndexSvmEntry = Type.Object(
  {
    nodeId: Type.String(),
    documentId: Type.String(),
    title: Type.Union([Type.String(), Type.Null()]),
    text: Type.String(),
    chunkIds: Type.Optional(Type.Array(Type.String(), { default: [] })),
    pageNumbers: Type.Optional(Type.Array(Type.Integer(), { default: [] })),
    // Reliability signals. consensus_ratio is the share of repeated selections that
    // kept this section; relevance is how far the extracted sentences carry an
    // assessment; confidence combines both. Each stays null when its signal is
    // missing, which is also the replay value for payloads serialized before them.
    consensusRatio: Type.Optional(Type.Union([Type.Ref(score), Type.Null()], { default: null })),
    relevance: Type.Optional(Type.Union([Type.Ref(score), Type.Null()], { default: null })),
    confidence: Type.Optional(Type.Union([Type.Ref(score), Type.Null()], { default: null })),
  },
  { $id: "SucheZuordnungPageIndexSVMEntry", additionalProperties: false },
);
const pageIndexSvmResult = Type.Object(
  { originaltexte: Type.Array(Type.Ref(pageIndexSvmEntry)) },
  { $id: "SucheZuordnungPageIndexSVMResult", additionalProperties: false },
);
const pageIndexSvmWorkflowOutput = Type.Object(
  { result: Type.Union([Type.Ref(pageIndexSvmResult), Type.Null()]) },
  { $id: "SucheZuordnungPageIndexSVMWorkflowOutput", additionalProperties: false },
);
const workflowInput = Type.Object(
  {
    norm: Type.String(),
    tbm: Type.String(),
    satzId: Type.String(),
    gesetzId: Type.String(),
    normId: Type.String(),
    data: Type.Ref(normData),
    projectId: Type.String(),
    normdetailId: Type.String(),
    maxConcurrentPageindexSvm: Type.Optional(
      Type.Union([Type.Integer({ minimum: 1 }), Type.Null()], { default: null }),
    ),
    documentNodes: Type.Array(Type.Ref(document)),
  },
  { $id: "SatzOrchestratorWorkflowInput", additionalProperties: false },
);
const workflowOutput = Type.Object(
  {
    satzId: Type.String(),
    gesetzId: Type.String(),
    normId: Type.String(),
    originaltexte: Type.Array(Type.Ref(pageIndexSvmEntry)),
  },
  { $id: "SatzOrchestratorWorkflowOutput", additionalProperties: false },
);

const contracts = Type.Module({
  Source: SourceSchema,
  SucheZuordnungScore: score,
  SucheZuordnungDefinition: definition,
  SucheZuordnungBestimmterRechtsbegriff: bestimmterRechtsbegriff,
  SucheZuordnungAuslegungsvorschlag: auslegungsvorschlag,
  SucheZuordnungUnbestimmterRechtsbegriff: unbestimmterRechtsbegriff,
  SucheZuordnungRechtsbegriffe: rechtsbegriffe,
  SucheZuordnungAtomaresTBM: atomaresTbm,
  SucheZuordnungSatz: satz,
  SucheZuordnungAbsatz: absatz,
  SucheZuordnungNormData: normData,
  SucheZuordnungDocumentNode: documentNode,
  SucheZuordnungDocument: document,
  SucheZuordnungPageIndexSVMEntry: pageIndexSvmEntry,
  SucheZuordnungPageIndexSVMResult: pageIndexSvmResult,
  SucheZuordnungPageIndexSVMWorkflowOutput: pageIndexSvmWorkflowOutput,
  SatzOrchestratorWorkflowInput: workflowInput,
  SatzOrchestratorWorkflowOutput: workflowOutput,
});

export const SucheZuordnungDefinition = contracts.Import("SucheZuordnungDefinition");
export const SucheZuordnungBestimmterRechtsbegriff = contracts.Import(
  "SucheZuordnungBestimmterRechtsbegriff",
);
export const SucheZuordnungAuslegungsvorschlag = contracts.Import(
  "SucheZuordnungAuslegungsvorschlag",
);
export const SucheZuordnungUnbestimmterRechtsbegriff = contracts.Import(
  "SucheZuordnungUnbestimmterRechtsbegriff",
);
export const SucheZuordnungRechtsbegriffe = contracts.Import("SucheZuordnungRechtsbegriffe");
export const SucheZuordnungAtomaresTBM = contracts.Import("SucheZuordnungAtomaresTBM");
export const SucheZuordnungSatz = contracts.Import("SucheZuordnungSatz");
export const SucheZuordnungAbsatz = contracts.Import("SucheZuordnungAbsatz");
export const SucheZuordnungNormData = contracts.Import("SucheZuordnungNormData");
export const SucheZuordnungDocumentNode = contracts.Import("SucheZuordnungDocumentNode");
export const SucheZuordnungDocument = contracts.Import("SucheZuordnungDocument");
export const SucheZuordnungPageIndexSVMEntry = contracts.Import("SucheZuordnungPageIndexSVMEntry");
export const SucheZuordnungPageIndexSVMResult = contracts.Import(
  "SucheZuordnungPageIndexSVMResult",
);
export const SucheZuordnungPageIndexSVMWorkflowOutput = contracts.Import(
  "SucheZuordnungPageIndexSVMWorkflowOutput",
);
export const SatzOrchestratorWorkflowInput = Type.Unsafe<Static<typeof workflowInput>>(
  contracts.Import("SatzOrchestratorWorkflowInput"),
);
export const SatzOrchestratorWorkflowOutput = Type.Unsafe<Static<typeof workflowOutput>>(
  contracts.Import("SatzOrchestratorWorkflowOutput"),
);

export type SucheZuordnungNormData = Static<typeof normData>;
export type SucheZuordnungDocument = Static<typeof document>;
export type SatzOrchestratorWorkflowInput = Static<typeof workflowInput>;
export type SatzOrchestratorWorkflowOutput = Static<typeof workflowOutput>;
