import { type ObjectOptions, type Static, Type } from "@sinclair/typebox";
import {
  CategorizedDocumentTypeInput,
  type Chunk as TemporalChunk,
  type ProcessedFileInfo as TemporalProcessedFileInfo,
} from "@spark-temporal/contracts";

import type { NodeJson } from "@spark-workflow/node-crud";
const strict = { additionalProperties: false } satisfies ObjectOptions;
const uuidPattern =
  "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$";
const canonicalBase64Pattern = "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$";

export const UuidSchema = Type.String({ pattern: uuidPattern });
const PostgresUuidSchema = Type.String({
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
});
export const NonEmptyStringSchema = Type.String({ minLength: 1 });
export const FppFileSchema = Type.Object(
  {
    url: NonEmptyStringSchema,
    fileName: NonEmptyStringSchema,
    fileId: UuidSchema,
    fileType: NonEmptyStringSchema,
  },
  strict,
);
export const FppRequestSchema = Type.Object(
  { projectId: NonEmptyStringSchema, file: FppFileSchema },
  strict,
);
export const FvpRequestSchema = Type.Object({ projectId: NonEmptyStringSchema }, strict);
export const SuzRequestSchema = Type.Object({ projectId: UuidSchema }, strict);
export const BatchMvpRequestSchema = Type.Object({ projectId: UuidSchema }, strict);
export const BewertungRequestSchema = Type.Object(
  { projectId: UuidSchema, normId: UuidSchema },
  strict,
);
export const RisikohinweiseRequestSchema = Type.Object(
  { projectId: UuidSchema, vaeNodeId: UuidSchema },
  strict,
);
export const FvpWorkflowArgsSchema = Type.Object({ projectId: NonEmptyStringSchema }, strict);

export const WorkflowPrioritySchema = Type.Object(
  {
    fairnessKey: NonEmptyStringSchema,
    fairnessWeight: Type.Number({ exclusiveMinimum: 0 }),
  },
  strict,
);
const ReusePolicySchema = Type.Union([
  Type.Literal("ALLOW_DUPLICATE"),
  Type.Literal("ALLOW_DUPLICATE_FAILED_ONLY"),
  Type.Literal("REJECT_DUPLICATE"),
]);
const ConflictPolicySchema = Type.Union([
  Type.Literal("UNSPECIFIED"),
  Type.Literal("USE_EXISTING"),
]);
const startFields = {
  workflowName: NonEmptyStringSchema,
  executionId: NonEmptyStringSchema,
  taskQueue: NonEmptyStringSchema,
  projectId: NonEmptyStringSchema,
  projectVersion: Type.Integer({ minimum: 1 }),
  idReusePolicy: ReusePolicySchema,
  idConflictPolicy: ConflictPolicySchema,
  priority: Type.Union([WorkflowPrioritySchema, Type.Null()]),
};
export const AnonymizationCommandInputSchema = Type.Object(
  {
    workflowName: NonEmptyStringSchema,
    executionId: NonEmptyStringSchema,
    taskQueue: NonEmptyStringSchema,
    requestId: UuidSchema,
    pdfBase64: Type.Optional(Type.String({ minLength: 4, pattern: canonicalBase64Pattern })),
    idReusePolicy: ReusePolicySchema,
    idConflictPolicy: ConflictPolicySchema,
    priority: WorkflowPrioritySchema,
  },
  strict,
);
export const FppCommandInputSchema = Type.Object({ ...startFields, file: FppFileSchema }, strict);
export const FvpCommandInputSchema = Type.Object(startFields, strict);
export const SuzCommandInputSchema = Type.Object({ ...startFields, normId: UuidSchema }, strict);
export const BatchMvpCommandInputSchema = Type.Object(startFields, strict);
export const BewertungCommandInputSchema = Type.Object(
  { ...startFields, normId: UuidSchema },
  strict,
);
export const RisikohinweiseCommandInputSchema = Type.Object(
  { ...startFields, vaeNodeId: UuidSchema },
  strict,
);
export const CancelCommandInputSchema = Type.Object({ workflowId: NonEmptyStringSchema }, strict);
export const WorkflowStartResultSchema = Type.Object({ workflowId: NonEmptyStringSchema }, strict);
export const WorkflowResponseSchema = Type.Object({ parentJobId: NonEmptyStringSchema }, strict);
export const CancelWorkflowResponseSchema = Type.Object(
  { workflowId: NonEmptyStringSchema },
  strict,
);
export const AnonymizationResultSchema = Type.Object(
  {
    pdfBase64: Type.String({ minLength: 4, pattern: canonicalBase64Pattern }),
    mediaType: Type.Literal("application/pdf"),
  },
  strict,
);
export const TemporalCommandErrorSchema = Type.Object(
  {
    kind: Type.Union([Type.Literal("already_started"), Type.Literal("operation_failed")]),
    code: Type.Union([NonEmptyStringSchema, Type.Integer()]),
    message: NonEmptyStringSchema,
  },
  strict,
);

export const FileObjectSchema = Type.Object(
  {
    id: UuidSchema,
    type: NonEmptyStringSchema,
    filename: NonEmptyStringSchema,
    mimeType: Type.Union([Type.String(), Type.Null()]),
    bucketPath: NonEmptyStringSchema,
    projectId: Type.Union([UuidSchema, Type.Null()]),
    workflowId: Type.Union([Type.String(), Type.Null()]),
    runId: Type.Union([Type.String(), Type.Null()]),
    vectorSearchable: Type.Union([Type.Boolean(), Type.Null()]),
    topics: Type.Array(UuidSchema),
    createdAt: NonEmptyStringSchema,
    updatedAt: NonEmptyStringSchema,
  },
  strict,
);
export const TopicSchema = Type.Object(
  {
    id: UuidSchema,
    projectId: UuidSchema,
    parentTopicId: Type.Union([UuidSchema, Type.Null()]),
    name: NonEmptyStringSchema,
    description: Type.Union([Type.String(), Type.Null()]),
    isDeleted: Type.Boolean(),
    createdAt: NonEmptyStringSchema,
    updatedAt: NonEmptyStringSchema,
  },
  strict,
);
export const TemplateDocumentTypeSchema = Type.Object(
  {
    category: Type.String(),
    documentTypeId: PostgresUuidSchema,
    documentTypeName: NonEmptyStringSchema,
    documentTypeDescription: Type.String(),
    expectedCount: Type.Union([Type.Integer(), Type.Null()]),
  },
  strict,
);
export const NodeReferenceSchema = Type.Object(
  {
    nodeType: NonEmptyStringSchema,
    id: NonEmptyStringSchema,
  },
  strict,
);
export const GraphReferenceSchema = Type.Object(
  {
    nodeType: NonEmptyStringSchema,
    id: NonEmptyStringSchema,
    parents: Type.Optional(Type.Array(NodeReferenceSchema)),
  },
  { additionalProperties: true },
);
export const GraphListSchema = Type.Object({ nodes: Type.Array(GraphReferenceSchema) }, strict);
export const GraphMutationResultSchema = Type.Object(
  {
    inserted: Type.Optional(Type.Array(GraphReferenceSchema)),
    updated: Type.Optional(Type.Array(GraphReferenceSchema)),
    deleted: Type.Optional(Type.Array(NodeReferenceSchema)),
  },
  { additionalProperties: true },
);

export const DocumentTopicSchema = Type.Object(
  {
    id: UuidSchema,
    name: NonEmptyStringSchema,
    description: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: true },
);
export const FullFvpWorkflowInputSchema = Type.Object(
  {
    projectId: NonEmptyStringSchema,
    fileIds: Type.Array(UuidSchema),
    candidateFileIds: Type.Array(UuidSchema),
    dokumentIdByFileId: Type.Record(Type.String(), NonEmptyStringSchema),
    hasTocDocument: Type.Boolean(),
    incremental: Type.Boolean(),
    topics: Type.Array(DocumentTopicSchema),
    documentTypes: CategorizedDocumentTypeInput,
  },
  strict,
);
export type NodeMutation = {
  nodeType: string;
  id: string;
  payload: { [key: string]: NodeJson | undefined };
};
export const NodeMutationSchema = Type.Unsafe<NodeMutation>(
  Type.Object(
    {
      nodeType: NonEmptyStringSchema,
      id: NonEmptyStringSchema,
      payload: Type.Object({}, { additionalProperties: true }),
    },
    strict,
  ),
);
export const DocumentExtractionEntrySchema = Type.Object(
  {
    dokumentId: UuidSchema,
    sourceFileId: Type.Union([UuidSchema, Type.Null()]),
    hasDokumentIdOverride: Type.Boolean(),
    inserts: Type.Array(NodeMutationSchema),
  },
  strict,
);
export const BatchInsertExtractionInputSchema = Type.Object(
  {
    projectId: UuidSchema,
    entries: Type.Array(DocumentExtractionEntrySchema),
  },
  strict,
);
export const InsertDocumentExtractionOutputSchema = Type.Object(
  {
    dokumentId: UuidSchema,
    skipped: Type.Boolean(),
    nodesInserted: Type.Integer({ minimum: 0 }),
  },
  strict,
);
export const BatchInsertExtractionOutputSchema = Type.Object(
  { results: Type.Array(InsertDocumentExtractionOutputSchema) },
  strict,
);
export type FppRequest = Static<typeof FppRequestSchema>;
export type FvpRequest = Static<typeof FvpRequestSchema>;
export type SuzRequest = Static<typeof SuzRequestSchema>;
export type BatchMvpRequest = Static<typeof BatchMvpRequestSchema>;
export type BewertungRequest = Static<typeof BewertungRequestSchema>;
export type RisikohinweiseRequest = Static<typeof RisikohinweiseRequestSchema>;
export type FvpWorkflowArgs = Static<typeof FvpWorkflowArgsSchema>;
export type AnonymizationCommandInput = Static<typeof AnonymizationCommandInputSchema>;
export type FppCommandInput = Static<typeof FppCommandInputSchema>;
export type FvpCommandInput = Static<typeof FvpCommandInputSchema>;
export type SuzCommandInput = Static<typeof SuzCommandInputSchema>;
export type BatchMvpCommandInput = Static<typeof BatchMvpCommandInputSchema>;
export type BewertungCommandInput = Static<typeof BewertungCommandInputSchema>;
export type RisikohinweiseCommandInput = Static<typeof RisikohinweiseCommandInputSchema>;
export type CancelCommandInput = Static<typeof CancelCommandInputSchema>;
export type WorkflowStartResult = Static<typeof WorkflowStartResultSchema>;
export type AnonymizationResult = Static<typeof AnonymizationResultSchema>;
export type FileObject = Static<typeof FileObjectSchema>;
export type Topic = Static<typeof TopicSchema>;
export type TemplateDocumentType = Static<typeof TemplateDocumentTypeSchema>;
export type GraphReference = Static<typeof GraphReferenceSchema>;
export type ProcessedChunk = TemporalChunk;
export type ProcessedFileInfo = TemporalProcessedFileInfo;
export type DocumentTopic = Static<typeof DocumentTopicSchema>;
export type FullFvpWorkflowInput = Static<typeof FullFvpWorkflowInputSchema>;
export type DocumentExtractionEntry = Static<typeof DocumentExtractionEntrySchema>;
export type BatchInsertExtractionInput = Static<typeof BatchInsertExtractionInputSchema>;
export type BatchInsertExtractionOutput = Static<typeof BatchInsertExtractionOutputSchema>;
export interface InsertExtractionResultsInput {
  projectId: string;
  processedFiles: ProcessedFileInfo[];
  dokumentIdByFileId: Record<string, string>;
}
