import { type ObjectOptions, type Static, Type } from "@sinclair/typebox";
import type { ActivityOptions, ChildWorkflowOptions } from "@temporalio/workflow";
import type {
  FundstellenReplacement,
  ProcessingSourceRevision,
} from "@spark-workflow/examination-service/resource";
import {
  RechtsmethodikWorkflowOutput as RechtsmethodikResultSchema,
  SatzOrchestratorWorkflowInput,
  SatzOrchestratorWorkflowOutput,
  SucheZuordnungNormData,
  type SucheZuordnungDocument,
  type RechtsmethodikWorkflowOutput as RechtsmethodikResult,
  type SatzOrchestratorWorkflowInput as SatzChildInput,
  type SatzOrchestratorWorkflowOutput as SatzChildOutput,
} from "@spark-temporal/contracts";
export type { ExaminationRechtsmethodikContext } from "@spark-temporal/contracts";

import { NodeMutationSchema, UuidSchema } from "../schemas.ts";
import { ProcessingSourceRevisionSchema } from "./assessment-contracts.ts";

const strict = { additionalProperties: false } satisfies ObjectOptions;
const typedRechtsmethodikResultSchema = Type.Unsafe<RechtsmethodikResult>(
  RechtsmethodikResultSchema,
);
const typedSatzChildInputSchema = Type.Unsafe<SatzChildInput>(SatzOrchestratorWorkflowInput);
const typedSatzChildOutputSchema = Type.Unsafe<SatzChildOutput>(SatzOrchestratorWorkflowOutput);
export const RechtsmethodikChildInputSchema = Type.Object(
  { jurabk: Type.String(), paragraphNr: Type.String() },
  strict,
);

export const MvpWorkflowInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    jurabk: Type.String(),
    paragraphNr: Type.String(),
  },
  strict,
);
export const MvpWorkflowOutputSchema = Type.Object(
  {
    projectId: UuidSchema,
    jurabk: Type.String(),
    paragraphNr: Type.String(),
    skipped: Type.Boolean(),
    gesetzId: Type.Union([UuidSchema, Type.Null()]),
    normId: Type.Union([UuidSchema, Type.Null()]),
  },
  strict,
);
export const TopicNormRefSchema = Type.Object(
  {
    ownerNodeType: Type.String(),
    ownerNodeId: Type.String(),
    topicNormId: Type.String(),
  },
  strict,
);
export const NormRefSchema = Type.Object(
  {
    jurabk: Type.String(),
    paragraphNr: Type.String(),
    topicNorms: Type.Array(TopicNormRefSchema),
  },
  strict,
);
export const BatchMvpWorkflowInputSchema = Type.Object({ projectId: UuidSchema }, strict);
export const CachedNormBatchInputSchema = Type.Object(
  { projectId: UuidSchema, norms: Type.Array(NormRefSchema) },
  strict,
);
export const CachedNormBatchOutputSchema = Type.Object(
  {
    results: Type.Array(MvpWorkflowOutputSchema),
    uncachedNorms: Type.Array(NormRefSchema),
  },
  strict,
);
export const BatchMvpWorkflowOutputSchema = Type.Object(
  { projectId: UuidSchema, results: Type.Array(MvpWorkflowOutputSchema) },
  strict,
);

export const InsertRechtsmethodikResultOutputSchema = Type.Object(
  {
    gesetzId: Type.Union([UuidSchema, Type.Null()]),
    normId: Type.Union([UuidSchema, Type.Null()]),
    skipped: Type.Boolean(),
    nodesInserted: Type.Integer({ minimum: 0 }),
  },
  strict,
);
export const InsertRechtsmethodikResultsInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    normResults: Type.Array(typedRechtsmethodikResultSchema),
  },
  strict,
);
export const ExaminationRechtsmethodikContextSchema = Type.Object(
  {
    gesetze: Type.Array(NodeMutationSchema),
    norms: Type.Array(NodeMutationSchema),
    absaetze: Type.Array(NodeMutationSchema),
    saetze: Type.Array(NodeMutationSchema),
  },
  strict,
);
export const WriteRechtsmethodikResultInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    inserts: Type.Array(NodeMutationSchema),
    updates: Type.Array(NodeMutationSchema),
    gesetzId: UuidSchema,
    normId: UuidSchema,
  },
  strict,
);
export const NormExaminationIdsSchema = Type.Object(
  {
    gesetzId: Type.String(),
    satzIdLookup: Type.Record(Type.String(), Type.String()),
    satzUpdatedAt: Type.Record(Type.String(), Type.String()),
    sources: Type.Array(ProcessingSourceRevisionSchema),
  },
  strict,
);
export const SuzWorkflowInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    normId: UuidSchema,
    data: Type.Optional(Type.Union([SucheZuordnungNormData, Type.Null()])),
  },
  strict,
);
export const SuzWorkflowOutputSchema = Type.Object(
  {
    norm: Type.String(),
    satzResults: Type.Array(typedSatzChildOutputSchema),
  },
  strict,
);
export const InsertSuzResultsInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    satzOrchestratorOutputs: Type.Array(typedSatzChildOutputSchema),
    resultId: UuidSchema,
    satzUpdatedAt: Type.Record(Type.String(), Type.String()),
    sources: Type.Array(ProcessingSourceRevisionSchema),
  },
  strict,
);
export const InsertSuzResultsOutputSchema = Type.Object(
  {
    fundstellenInserted: Type.Integer({ minimum: 0 }),
    skipped: Type.Boolean(),
    inserts: Type.Array(NodeMutationSchema),
  },
  strict,
);
export const ResolveChunkDokumenteInputSchema = Type.Object(
  { projectId: UuidSchema, chunkIds: Type.Array(Type.String()) },
  strict,
);
export interface WriteSatzFundstellenInput extends FundstellenReplacement {
  projectId: string;
}
export interface SuzDocuments {
  documents: SucheZuordnungDocument[];
  sources: ProcessingSourceRevision[];
}

const RetainedFixtureNameSchema = Type.String({ minLength: 1 });
export interface RetainedChildCatalog {
  fixtures: Array<
    | {
        name: string;
        kind: "rechtsmethodik";
        input: Static<typeof RechtsmethodikChildInputSchema>;
        output: RechtsmethodikResult;
      }
    | {
        name: string;
        kind: "satz";
        input: SatzChildInput;
        output: SatzChildOutput;
      }
  >;
}

export const RetainedChildCatalogSchema = Type.Unsafe<RetainedChildCatalog>(
  Type.Object(
    {
      fixtures: Type.Array(
        Type.Union([
          Type.Object(
            {
              name: RetainedFixtureNameSchema,
              kind: Type.Literal("rechtsmethodik"),
              input: RechtsmethodikChildInputSchema,
              output: typedRechtsmethodikResultSchema,
            },
            strict,
          ),
          Type.Object(
            {
              name: RetainedFixtureNameSchema,
              kind: Type.Literal("satz"),
              input: typedSatzChildInputSchema,
              output: typedSatzChildOutputSchema,
            },
            strict,
          ),
        ]),
      ),
    },
    strict,
  ),
);

export const NORM_ACTIVITY_OPTIONS = {
  mvpCacheRead: { startToCloseTimeout: "30 seconds" },
  mvpCacheSave: {
    startToCloseTimeout: "30 seconds",
    retry: { maximumAttempts: 20 },
  },
  batchFetchNorms: {
    startToCloseTimeout: "5 minutes",
    retry: { maximumAttempts: 3 },
  },
  batchCachedNorms: { startToCloseTimeout: "30 minutes" },
  rechtsmethodikTopicFetch: {
    startToCloseTimeout: "30 seconds",
    retry: {
      initialInterval: "2 seconds",
      maximumInterval: "10 seconds",
    },
  },
  rechtsmethodikContextFetch: {
    startToCloseTimeout: "5 minutes",
    retry: {
      initialInterval: "2 seconds",
      maximumInterval: "10 seconds",
    },
  },
  rechtsmethodikWrite: {
    startToCloseTimeout: "30 seconds",
    retry: { maximumAttempts: 1 },
  },
  suzDocumentFetch: {
    startToCloseTimeout: "10 minutes",
    heartbeatTimeout: "2 minutes",
    retry: {
      maximumAttempts: 3,
      initialInterval: "10 seconds",
      backoffCoefficient: 2,
    },
  },
  suzGraphFetch: {
    startToCloseTimeout: "5 minutes",
    heartbeatTimeout: "2 minutes",
    retry: {
      maximumAttempts: 3,
      initialInterval: "10 seconds",
      backoffCoefficient: 2,
    },
  },
  suzResultPeer: {
    startToCloseTimeout: "30 seconds",
    retry: {
      initialInterval: "2 seconds",
      maximumInterval: "10 seconds",
    },
  },
} satisfies Record<string, ActivityOptions>;

export const NORM_CHILD_OPTIONS = {
  rechtsmethodik: {
    workflowExecutionTimeout: "6 hours",
    workflowTaskTimeout: "60 seconds",
  },
  batchMvp: {
    workflowExecutionTimeout: "12 hours",
    workflowTaskTimeout: "60 seconds",
    retry: { maximumAttempts: 2 },
  },
  satz: {
    workflowExecutionTimeout: "6 hours",
    workflowTaskTimeout: "60 seconds",
    retry: { maximumAttempts: 2 },
  },
  suzInsert: {
    workflowExecutionTimeout: "2 hours",
    workflowTaskTimeout: "60 seconds",
    retry: { maximumAttempts: 10 },
  },
} satisfies Record<string, ChildWorkflowOptions>;

export const NORM_LIMITS = {
  batchMvp: 5,
  satzChildren: 8,
  pageIndex: 2,
  resultInsertion: 10,
  rechtsmethodikReconcileAttempts: 5,
  rechtsmethodikReconcileDelay: "2 seconds",
};

export type RechtsmethodikChildInput = Static<typeof RechtsmethodikChildInputSchema>;
export type MvpWorkflowInput = Static<typeof MvpWorkflowInputSchema>;
export type MvpWorkflowOutput = Static<typeof MvpWorkflowOutputSchema>;
export type NormRef = Static<typeof NormRefSchema>;
export type CachedNormBatchInput = Static<typeof CachedNormBatchInputSchema>;
export type CachedNormBatchOutput = Static<typeof CachedNormBatchOutputSchema>;
export type BatchMvpWorkflowInput = Static<typeof BatchMvpWorkflowInputSchema>;
export type BatchMvpWorkflowOutput = Static<typeof BatchMvpWorkflowOutputSchema>;
export type InsertRechtsmethodikResultOutput = Static<
  typeof InsertRechtsmethodikResultOutputSchema
>;
export type InsertRechtsmethodikResultsInput = Static<
  typeof InsertRechtsmethodikResultsInputSchema
>;
export type WriteRechtsmethodikResultInput = Static<typeof WriteRechtsmethodikResultInputSchema>;
export type NormExaminationIds = Static<typeof NormExaminationIdsSchema>;
export type SuzWorkflowInput = Static<typeof SuzWorkflowInputSchema>;
export type SuzWorkflowOutput = Static<typeof SuzWorkflowOutputSchema>;
export type InsertSuzResultsInput = Static<typeof InsertSuzResultsInputSchema>;
export type InsertSuzResultsOutput = Static<typeof InsertSuzResultsOutputSchema>;
export type ResolveChunkDokumenteInput = Static<typeof ResolveChunkDokumenteInputSchema>;
