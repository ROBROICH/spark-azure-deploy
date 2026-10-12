import { type ObjectOptions, type Static, Type } from "@sinclair/typebox";
import type { ActivityOptions, ChildWorkflowOptions } from "@temporalio/workflow";
import {
  ArgumentClassificationOutput as ArgumentClassificationOutputContract,
  ArgumentClassificationParams as ArgumentClassificationInputContract,
  AtomaresTBM as AtomaresTbmContract,
  BewertungsWorkflowInput as BewertungsChildInputContract,
  BewertungsWorkflowOutput as BewertungOutputContract,
  ExtractedArgument as ExtractedArgumentContract,
  PFBChapter as PfbChapterContract,
  Rechtsfolge as RechtsfolgeContract,
  RiskFinderOutput as RiskFinderOutputContract,
  type ArgumentClassificationOutput,
  type ArgumentClassificationParams as ArgumentClassificationInput,
  type ArgumentRecord,
  type ArgumentTopic,
  type AtomaresTBM,
  type BewertungsWorkflowInput as BewertungsChildInput,
  type BewertungsWorkflowOutput as BewertungOutput,
  type ExtractedArgument,
  type PFBChapter as PfbChapter,
  type Rechtsfolge,
  type RiskFinderOutput,
} from "@spark-temporal/contracts";

import { NODE_VERSION_CONFLICT_TYPE } from "./workflow-contracts.ts";

const ArgumentClassificationOutputSchema = Type.Unsafe<ArgumentClassificationOutput>(
  ArgumentClassificationOutputContract,
);
const ArgumentClassificationInputSchema = Type.Unsafe<ArgumentClassificationInput>(
  ArgumentClassificationInputContract,
);
const AtomaresTbmSchema = Type.Unsafe<AtomaresTBM>(AtomaresTbmContract);
const BewertungsChildInputSchema = Type.Unsafe<BewertungsChildInput>(BewertungsChildInputContract);
const BewertungOutputSchema = Type.Unsafe<BewertungOutput>(BewertungOutputContract);
const ExtractedArgumentSchema = Type.Unsafe<ExtractedArgument>(ExtractedArgumentContract);
const PfbChapterSchema = Type.Unsafe<PfbChapter>(PfbChapterContract);
const RechtsfolgeSchema = Type.Unsafe<Rechtsfolge>(RechtsfolgeContract);
const RiskFinderOutputSchema = Type.Unsafe<RiskFinderOutput>(RiskFinderOutputContract);

export {
  ArgumentClassificationInputSchema,
  ArgumentClassificationOutputSchema,
  type ArgumentClassificationInput,
  type ArgumentClassificationOutput,
  type ArgumentRecord,
  type ArgumentTopic,
  type ExtractedArgument,
};

import { NonEmptyStringSchema, UuidSchema } from "../schemas.ts";

const strict = { additionalProperties: false } satisfies ObjectOptions;
const nullableString = Type.Union([Type.String(), Type.Null()]);

/** Lockstep with examination `fundstelle` in examination_service db/schema.ts. */
export const FundstelleContextSchema = Type.Object(
  {
    id: NonEmptyStringSchema,
    dokumentId: NonEmptyStringSchema,
    title: Type.String(),
    text: Type.String(),
    updatedAt: Type.String(),
    digest: Type.String(),
    documentUpdatedAt: Type.String(),
    documentDigest: Type.String(),
    chunkIds: Type.Array(NonEmptyStringSchema),
    pageNumbers: Type.Array(Type.Integer()),
  },
  strict,
);
export const SatzContextSchema = Type.Object(
  {
    satzId: NonEmptyStringSchema,
    satzText: Type.String(),
    updatedAt: Type.String(),
    digest: Type.String(),
    needsRefresh: Type.Boolean(),
    normTypLvl1: nullableString,
    normTypLvl2: nullableString,
    atomareTbm: Type.Array(AtomaresTbmSchema),
    rechtsfolge: Type.Union([RechtsfolgeSchema, Type.Null()]),
    fundstellen: Type.Array(FundstelleContextSchema),
  },
  strict,
);
export const NormContextSchema = Type.Object(
  {
    gesetzName: Type.String(),
    jurabk: Type.String(),
    paragraphNr: Type.String(),
    paragraphTitel: Type.String(),
    paragraphText: Type.String(),
    saetze: Type.Array(SatzContextSchema),
  },
  strict,
);
export const BewertungWorkflowInputSchema = Type.Object(
  { projectId: UuidSchema, normId: UuidSchema },
  strict,
);
export const GatherNormContextInputSchema = BewertungWorkflowInputSchema;
export const ProcessingSourceRevisionSchema = Type.Object(
  {
    nodeType: Type.String(),
    id: Type.String(),
    updatedAt: Type.String(),
    digest: Type.String(),
    isOutdated: Type.Boolean(),
    satzId: Type.Optional(Type.String()),
  },
  strict,
);
export const SatzBewertungResultSchema = Type.Object(
  {
    satzId: NonEmptyStringSchema,
    bewertungOutput: BewertungOutputSchema,
    sources: Type.Array(ProcessingSourceRevisionSchema),
  },
  strict,
);
export const ProcessBewertungenInputSchema = Type.Object(
  { normContext: NormContextSchema },
  strict,
);
export const ProcessBewertungenOutputSchema = Type.Object(
  {
    satzOutputs: Type.Array(SatzBewertungResultSchema),
    skippedSatzIds: Type.Array(NonEmptyStringSchema),
  },
  strict,
);
export const InsertBewertungInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    satzOutputs: Type.Array(SatzBewertungResultSchema),
  },
  strict,
);
export const InsertBewertungSatzOutputSchema = Type.Object(
  {
    satzId: NonEmptyStringSchema,
    bewertungId: Type.String(),
    nodesInserted: Type.Integer({ minimum: 0 }),
    skipped: Type.Boolean(),
  },
  strict,
);
export const InsertBewertungOutputSchema = Type.Object(
  { satzResults: Type.Array(InsertBewertungSatzOutputSchema) },
  strict,
);
export const BewertungWorkflowOutputSchema = Type.Object(
  {
    projectId: UuidSchema,
    normId: UuidSchema,
    satzResults: Type.Array(InsertBewertungSatzOutputSchema),
  },
  strict,
);
export const MarkdownTextInsertPayloadSchema = Type.Object({ text: Type.String() }, strict);
export const BewertungInsertPayloadSchema = Type.Object(
  {
    satzId: NonEmptyStringSchema,
    result: Type.String(),
    kurzform: Type.Union([Type.String(), Type.Null()]),
    norm: Type.String(),
    markdownTextId: NonEmptyStringSchema,
  },
  strict,
);
export const BewertungKapitelInsertPayloadSchema = Type.Object(
  {
    bewertungId: NonEmptyStringSchema,
    titel: Type.String(),
    markdown: Type.String(),
    kurzform: Type.Union([Type.String(), Type.Null()]),
    order: Type.Integer(),
  },
  strict,
);
export const BewertungQuelleInsertPayloadSchema = Type.Object(
  {
    bewertungId: NonEmptyStringSchema,
    dokumentId: NonEmptyStringSchema,
    fundstelleId: Type.Union([NonEmptyStringSchema, Type.Null()]),
    title: Type.String(),
    citedSvmId: Type.Optional(Type.String()),
    chunkIds: Type.Array(Type.String()),
    pageNumbers: Type.Array(Type.Integer()),
  },
  strict,
);
export type GraphInsert =
  | {
      nodeType: "markdown_text";
      id: string;
      payload: Static<typeof MarkdownTextInsertPayloadSchema>;
    }
  | {
      nodeType: "bewertung";
      id: string;
      payload: Static<typeof BewertungInsertPayloadSchema>;
    }
  | {
      nodeType: "bewertung_kapitel";
      id: string;
      payload: Static<typeof BewertungKapitelInsertPayloadSchema>;
    }
  | {
      nodeType: "bewertung_quelle";
      id: string;
      payload: Static<typeof BewertungQuelleInsertPayloadSchema>;
    };
export const GraphInsertSchema = Type.Unsafe<GraphInsert>(
  Type.Union([
    Type.Object(
      {
        nodeType: Type.Literal("markdown_text"),
        id: NonEmptyStringSchema,
        payload: MarkdownTextInsertPayloadSchema,
      },
      strict,
    ),
    Type.Object(
      {
        nodeType: Type.Literal("bewertung"),
        id: NonEmptyStringSchema,
        payload: BewertungInsertPayloadSchema,
      },
      strict,
    ),
    Type.Object(
      {
        nodeType: Type.Literal("bewertung_kapitel"),
        id: NonEmptyStringSchema,
        payload: BewertungKapitelInsertPayloadSchema,
      },
      strict,
    ),
    Type.Object(
      {
        nodeType: Type.Literal("bewertung_quelle"),
        id: NonEmptyStringSchema,
        payload: BewertungQuelleInsertPayloadSchema,
      },
      strict,
    ),
  ]),
);
export const WriteBewertungSatzInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    satzId: NonEmptyStringSchema,
    bewertungId: NonEmptyStringSchema,
    sources: Type.Array(ProcessingSourceRevisionSchema),
    inserts: Type.Array(GraphInsertSchema),
  },
  strict,
);

export const EwmsChunkSchema = Type.Object(
  {
    chunkId: UuidSchema,
    pageContent: Type.String(),
    pageNumbers: Type.Array(Type.Integer()),
  },
  strict,
);
export const ProcessedEwmsDocumentSchema = Type.Object(
  {
    promptInjection: Type.Object(
      {
        injectionDetected: Type.Boolean(),
        snippet: nullableString,
      },
      strict,
    ),
    markdown: Type.String(),
    chunks: Type.Array(EwmsChunkSchema),
    originalFileId: NonEmptyStringSchema,
  },
  strict,
);
export const ProcessDocumentsEwmsInputSchema = Type.Object(
  {
    fileIds: Type.Array(UuidSchema),
    projectId: UuidSchema,
  },
  strict,
);
export const ProcessDocumentsEwmsOutputSchema = Type.Object(
  { processedFilesOutput: Type.Array(ProcessedEwmsDocumentSchema) },
  strict,
);
export const ArgumentExtractionInputSchema = Type.Object(
  { processedFilesOutput: Type.Array(ProcessedEwmsDocumentSchema) },
  strict,
);
export const ArgumentExtractionOutputSchema = Type.Object(
  {
    documentArguments: Type.Array(
      Type.Object(
        {
          documentId: NonEmptyStringSchema,
          chunkArguments: Type.Array(
            Type.Object(
              {
                chunk: EwmsChunkSchema,
                arguments: Type.Array(ExtractedArgumentSchema),
              },
              strict,
            ),
          ),
        },
        strict,
      ),
    ),
  },
  strict,
);
export const EwmsDocumentsSchema = Type.Object(
  {
    fileIds: Type.Array(UuidSchema),
    documentNamesById: Type.Record(Type.String(), Type.String()),
  },
  strict,
);
export const FetchEwmsDocumentsInputSchema = Type.Object(
  { projectId: UuidSchema, fileIds: Type.Array(UuidSchema) },
  strict,
);
export const StoreExtractionInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    extractionOutput: ArgumentExtractionOutputSchema,
    documentNamesById: Type.Record(Type.String(), Type.String()),
    markdownById: Type.Record(Type.String(), Type.String()),
  },
  strict,
);
export const StoreClassificationInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    classificationOutput: ArgumentClassificationOutputSchema,
  },
  strict,
);
export const MarkClassificationFailedInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    beteiligungsEingangIds: Type.Array(UuidSchema),
  },
  strict,
);
export const InjectionDetectedDocumentSchema = Type.Object(
  {
    fileId: UuidSchema,
    documentName: NonEmptyStringSchema,
    snippet: nullableString,
  },
  strict,
);
export const StoreInjectionInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    documents: Type.Array(InjectionDetectedDocumentSchema),
  },
  strict,
);
export const ExtractionStoreResponseSchema = Type.Object(
  {
    results: Type.Array(
      Type.Object(
        {
          documentId: UuidSchema,
          skipped: Type.Optional(Type.Boolean()),
          beteiligungsEingangId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
          arguments: Type.Optional(
            Type.Array(
              Type.Object(
                { argumentId: UuidSchema, extractedArgument: ExtractedArgumentSchema },
                { additionalProperties: true },
              ),
            ),
          ),
        },
        { additionalProperties: true },
      ),
    ),
  },
  { additionalProperties: true },
);
export const EwmsOrchestratorInputSchema = Type.Object(
  { projectId: UuidSchema, fileIds: Type.Array(UuidSchema) },
  strict,
);
export const EwmsEntrypointInputSchema = Type.Object(
  { projectId: UuidSchema, fileId: UuidSchema },
  strict,
);
export const EmptyOutputSchema = Type.Object({}, strict);

export const RisikohinweiseWorkflowInputSchema = Type.Object(
  { projectId: UuidSchema, vaeNodeId: UuidSchema },
  strict,
);
export const PersistedRiskSchema = Type.Object(
  {
    id: UuidSchema,
    vaeNodeId: UuidSchema,
    problem: Type.String(),
    recommendation: nullableString,
    quote: nullableString,
    severity: Type.Integer({ minimum: 1, maximum: 10 }),
    implication: Type.String(),
    status: Type.Union([
      Type.Literal("open"),
      Type.Literal("corrected"),
      Type.Literal("ignored"),
      Type.Null(),
    ]),
  },
  strict,
);
export const ReplaceVaeNodeRisksInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    vaeNodeId: UuidSchema,
    risks: Type.Array(PersistedRiskSchema),
  },
  strict,
);
export const ReplaceProjectRisksOutputSchema = Type.Object(
  {
    deletedCount: Type.Integer({ minimum: 0 }),
    insertedCount: Type.Integer({ minimum: 0 }),
  },
  strict,
);
export const RisikohinweiseWorkflowOutputSchema = Type.Object(
  {
    projectId: UuidSchema,
    chaptersProcessed: Type.Integer({ minimum: 0 }),
    risksPersisted: Type.Integer({ minimum: 0 }),
  },
  strict,
);

export const SuzAwaitInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    projectVersion: Type.Integer({ minimum: 1 }),
    normId: UuidSchema,
    executionId: NonEmptyStringSchema,
    workflowName: Type.Literal("suche_zuordnung_norm"),
    taskQueue: NonEmptyStringSchema,
    idReusePolicy: Type.Literal("ALLOW_DUPLICATE"),
    idConflictPolicy: Type.Literal("USE_EXISTING"),
    priority: Type.Object(
      {
        fairnessKey: Type.Literal("priority"),
        fairnessWeight: Type.Literal(2),
      },
      strict,
    ),
  },
  strict,
);
export const SuzAwaitResultSchema = Type.Object({ completed: Type.Boolean() }, strict);
export const AssessmentTemporalErrorSchema = Type.Object(
  { code: NonEmptyStringSchema, message: NonEmptyStringSchema },
  strict,
);

const AssessmentRetainedFixtureNameSchema = Type.String({ minLength: 1 });
export const AssessmentRetainedCatalogSchema = Type.Object(
  {
    fixtures: Type.Array(
      Type.Union([
        Type.Object(
          {
            name: AssessmentRetainedFixtureNameSchema,
            kind: Type.Literal("bewertung"),
            input: BewertungsChildInputSchema,
            output: BewertungOutputSchema,
          },
          strict,
        ),
        Type.Object(
          {
            name: AssessmentRetainedFixtureNameSchema,
            kind: Type.Literal("ewms-documents"),
            input: ProcessDocumentsEwmsInputSchema,
            output: ProcessDocumentsEwmsOutputSchema,
          },
          strict,
        ),
        Type.Object(
          {
            name: AssessmentRetainedFixtureNameSchema,
            kind: Type.Literal("ewms-extraction"),
            input: ArgumentExtractionInputSchema,
            output: ArgumentExtractionOutputSchema,
          },
          strict,
        ),
        Type.Object(
          {
            name: AssessmentRetainedFixtureNameSchema,
            kind: Type.Literal("ewms-classification"),
            input: ArgumentClassificationInputSchema,
            output: ArgumentClassificationOutputSchema,
          },
          strict,
        ),
        Type.Object(
          {
            name: AssessmentRetainedFixtureNameSchema,
            kind: Type.Literal("risk"),
            input: PfbChapterSchema,
            output: RiskFinderOutputSchema,
          },
          strict,
        ),
      ]),
    ),
  },
  strict,
);

export type AssessmentRetainedCatalog = Static<typeof AssessmentRetainedCatalogSchema>;

export const ASSESSMENT_ACTIVITY_OPTIONS = {
  bewertungGather: {
    startToCloseTimeout: "10 minutes",
    retry: { maximumAttempts: 5, maximumInterval: "1 minute" },
  },
  bewertungSuz: {
    startToCloseTimeout: "12 hours",
    heartbeatTimeout: "120 seconds",
  },
  bewertungWrite: {
    startToCloseTimeout: "30 seconds",
    retry: { initialInterval: "2 seconds", maximumInterval: "10 seconds" },
  },
  ewmsPeer: {
    startToCloseTimeout: "60 seconds",
    retry: {
      initialInterval: "2 seconds",
      backoffCoefficient: 2,
      maximumInterval: "30 seconds",
      maximumAttempts: 30,
    },
  },
  riskPeer: {
    startToCloseTimeout: "60 seconds",
    retry: {
      initialInterval: "2 seconds",
      backoffCoefficient: 2,
      maximumInterval: "30 seconds",
      nonRetryableErrorTypes: [NODE_VERSION_CONFLICT_TYPE],
    },
  },
} satisfies Record<string, ActivityOptions>;

export const ASSESSMENT_CHILD_OPTIONS = {
  bewertung: {
    workflowTaskTimeout: "60 seconds",
    retry: { maximumInterval: "5 minutes" },
  },
  // EWMS child workflows previously had neither a retry ceiling nor an
  // execution timeout, so a stuck child could hang forever (EWMS-Sweep point 3,
  // Gitea-Epic #4567, topicIds 8CoK8bwey-k, i-1qphwBvbc). Bound both while
  // leaving ample room for the legitimately slow LLM extraction runs.
  ewms: {
    retry: { maximumAttempts: 30 },
    workflowExecutionTimeout: "6 hours",
  },
  ewmsDocuments: {
    retry: { maximumAttempts: 30 },
    workflowExecutionTimeout: "2 hours",
  },
  ewmsArguments: {
    retry: { maximumAttempts: 30 },
    workflowExecutionTimeout: "2 hours",
  },
} satisfies Record<string, ChildWorkflowOptions>;

export const ASSESSMENT_LIMITS = {
  bewertungFanout: 50,
  bewertungInsertFanout: 10,
  ewmsFanout: 10,
};

export type FundstelleContext = Static<typeof FundstelleContextSchema>;
export type SatzContext = Static<typeof SatzContextSchema>;
export type NormContext = Static<typeof NormContextSchema>;
export type BewertungWorkflowInput = Static<typeof BewertungWorkflowInputSchema>;
export type SatzBewertungResult = Static<typeof SatzBewertungResultSchema>;
export type ProcessBewertungenInput = Static<typeof ProcessBewertungenInputSchema>;
export type ProcessBewertungenOutput = Static<typeof ProcessBewertungenOutputSchema>;
export type InsertBewertungInput = Static<typeof InsertBewertungInputSchema>;
export type InsertBewertungSatzOutput = Static<typeof InsertBewertungSatzOutputSchema>;
export type InsertBewertungOutput = Static<typeof InsertBewertungOutputSchema>;
export type BewertungWorkflowOutput = Static<typeof BewertungWorkflowOutputSchema>;
export type WriteBewertungSatzInput = Static<typeof WriteBewertungSatzInputSchema>;
export type ProcessedEwmsDocument = Static<typeof ProcessedEwmsDocumentSchema>;
export type ProcessDocumentsEwmsInput = Static<typeof ProcessDocumentsEwmsInputSchema>;
export type ProcessDocumentsEwmsOutput = Static<typeof ProcessDocumentsEwmsOutputSchema>;
export type ArgumentExtractionInput = Static<typeof ArgumentExtractionInputSchema>;
export type ArgumentExtractionOutput = Static<typeof ArgumentExtractionOutputSchema>;
export type EwmsDocuments = Static<typeof EwmsDocumentsSchema>;
export type FetchEwmsDocumentsInput = Static<typeof FetchEwmsDocumentsInputSchema>;
export type StoreExtractionInput = Static<typeof StoreExtractionInputSchema>;
export type StoreClassificationInput = Static<typeof StoreClassificationInputSchema>;
export type MarkClassificationFailedInput = Static<typeof MarkClassificationFailedInputSchema>;
export type StoreInjectionInput = Static<typeof StoreInjectionInputSchema>;
export type ExtractionStoreResponse = Static<typeof ExtractionStoreResponseSchema>;
export type EwmsOrchestratorInput = Static<typeof EwmsOrchestratorInputSchema>;
export type EwmsEntrypointInput = Static<typeof EwmsEntrypointInputSchema>;
export type RisikohinweiseWorkflowInput = Static<typeof RisikohinweiseWorkflowInputSchema>;
export type PersistedRisk = Static<typeof PersistedRiskSchema>;
export type ReplaceVaeNodeRisksInput = Static<typeof ReplaceVaeNodeRisksInputSchema>;
export type ReplaceProjectRisksOutput = Static<typeof ReplaceProjectRisksOutputSchema>;
export type RisikohinweiseWorkflowOutput = Static<typeof RisikohinweiseWorkflowOutputSchema>;
export type SuzAwaitInput = Static<typeof SuzAwaitInputSchema>;
export type SuzAwaitResult = Static<typeof SuzAwaitResultSchema>;
