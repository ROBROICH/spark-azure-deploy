import {Type, type Static} from "@sinclair/typebox";

import {GeneratedDateTime, GeneratedStringId, GeneratedUUID, UUID, type WorkflowName, } from "../registry.js";

export const INHALTSEXTRAKTION_TASK_QUEUE = "extraction" as const;
export const INHALTSEXTRAKTION_PROCESS_DOCUMENTS_WORKFLOW =
  "process-documents-workflow" as WorkflowName<"process-documents-workflow">;
export const INHALTSEXTRAKTION_PROCESS_DOCUMENTS_EWMS_WORKFLOW =
  "process-documents-ewms-workflow" as WorkflowName<"process-documents-ewms-workflow">;
export const INHALTSEXTRAKTION_ENSURE_QDRANT_WORKFLOW =
  "ensure-qdrant-workflow" as WorkflowName<"ensure-qdrant-workflow">;
export const INHALTSEXTRAKTION_CHECK_QDRANT_INDEXED_WORKFLOW =
  "check-qdrant-indexed-workflow" as WorkflowName<"check-qdrant-indexed-workflow">;
export const INHALTSEXTRAKTION_BUILD_QDRANT_FROM_GRAPH_WORKFLOW =
  "build-qdrant-from-graph-workflow" as WorkflowName<"build-qdrant-from-graph-workflow">;
export const INHALTSEXTRAKTION_QDRANT_SOURCE_FILE_CLEANUP_WORKFLOW =
  "qdrant-source-file-cleanup-workflow" as WorkflowName<"qdrant-source-file-cleanup-workflow">;
export const INHALTSEXTRAKTION_QDRANT_SOURCE_FILE_CLEANUP_COMPENSATION_WORKFLOW =
  "qdrant-source-file-cleanup-compensation-workflow" as WorkflowName<"qdrant-source-file-cleanup-compensation-workflow">;
export const INHALTSEXTRAKTION_DELETE_DOCUMENTS_WORKFLOW =
  "delete-documents-workflow" as WorkflowName<"delete-documents-workflow">;

interface RelatedChunk {
  chunk_id: string;
  type?: string;
}

/**
 * Lockstep with AOS extraction mapping in
 * `02-backend/features/agent_orchestration_service/src/temporal/extraction.ts`
 * and reverse reconstruction in reverse-extraction.ts.
 * Field names here are the Temporal JSON keys; change both sides together.
 */
export type ChunkMetadata = {
  page_numbers?: number[];
  toc_path?: string[];
  all_subchapters?: string[];
  hypothetical_questions?: string[];
  chunk_type?: string;
  focus_topic?: string;
  related_assets?: RelatedChunk[];
  related_text?: RelatedChunk[];
  wildlife_species?: string[];
  plant_species?: string[];
  "Header 1"?: string | null;
  "Header 2"?: string | null;
  "Header 3"?: string | null;
  wildlife_mentioned?: boolean | null;
  plant_species_mentioned?: boolean | null;
  map_scale?: string | null;
  asset_path?: string;
  caption?: string;
  summary?: string;
  description?: string;
  content?: string;
  footnote?: string;
};

const ChunkMetadata = Type.Unsafe<ChunkMetadata>(
  Type.Record(Type.String(), Type.Unknown(), { default: {} }),
);

export const ProcessDocumentsEWMSWorkflowInputSchema = Type.Object({
  fileIds: Type.Array(UUID),
  projectId: UUID,
});
export const ChunkEWMSSchema = Type.Object({
  chunkId: Type.Ref("GeneratedUUID"),
  pageContent: Type.String(),
  pageNumbers: Type.Array(Type.Integer()),
});
export const PromptInjectionSchema = Type.Object({
  injectionDetected: Type.Boolean(),
  snippet: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});
export const SingleDocumentEWMSWorkflowOutputSchema = Type.Object({
  promptInjection: Type.Ref("PromptInjection"),
  markdown: Type.String(),
  chunks: Type.Array(Type.Ref("ChunkEWMS")),
  originalFileId: Type.String(),
});
export const ProcessDocumentsEWMSWorkflowOutputSchema = Type.Object({
  processedFilesOutput: Type.Array(Type.Ref("SingleDocumentEWMSWorkflowOutput")),
});

const contracts = Type.Module({
  GeneratedDateTime,
  GeneratedStringId,
  GeneratedUUID,
  BaseMetadata: Type.Object({
    applicationId: Type.String(),
    processingTimestamp: Type.Ref("GeneratedDateTime"),
    projectApplicant: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    plannedProject: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    projectLocation: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    affectedMunicipalities: Type.Optional(Type.Array(Type.String(), { default: [] })),
    affectedFederalStates: Type.Optional(Type.Array(Type.String(), { default: [] })),
    planningCompany: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    applicationSubject: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    pipelineLength: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    pipelineDiameter: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    applicationReceiptDate: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    responsiblePlanningAuthority: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  }),
  SubChunk: Type.Object({
    chunkId: Type.Ref("GeneratedUUID"),
    parentChunkId: Type.Optional(Type.Union([UUID, Type.Null()])),
    pageContent: Type.String(),
    metadata: Type.Optional(ChunkMetadata),
    header: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  }),
  PageIndexNode: Type.Object({ nodeId: Type.String(), summary: Type.String() }),
  Chunk: Type.Object({
    chunkId: Type.Ref("GeneratedUUID"),
    parentChunkId: Type.Optional(Type.Union([UUID, Type.Null()])),
    pageContent: Type.String(),
    metadata: Type.Optional(ChunkMetadata),
    subChunks: Type.Optional(Type.Array(Type.Ref("SubChunk"), { default: [] })),
    header: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    pageIndexNode: Type.Optional(Type.Union([Type.Ref("PageIndexNode"), Type.Null()])),
  }),
  DocumentTypeInfo: Type.Object({
    name: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    category: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    confidence: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
    reasoning: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    source: Type.Optional(Type.String({ default: "ai" })),
  }),
  DocumentTopic: Type.Object({
    id: UUID,
    name: Type.String(),
    description: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  }),
  Metadata: Type.Object({
    documentId: Type.Ref("GeneratedStringId"),
    originalDocumentName: Type.String(),
    sourceFileId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    documentType: Type.Optional(Type.Union([Type.Ref("DocumentTypeInfo"), Type.Null()])),
    pages: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
    baseMetadataStatus: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    baseMetadata: Type.Optional(Type.Union([Type.Ref("BaseMetadata"), Type.Null()])),
    summary: Type.String(),
    processingDurationSeconds: Type.Optional(Type.Union([Type.Number(), Type.Null()])),
    projectId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    documentTopic: Type.Optional(Type.Union([Type.Ref("DocumentTopic"), Type.Null()])),
  }),
  ProcessedDocument: Type.Object({
    metadata: Type.Ref("Metadata"),
    markdownContent: Type.String(),
    chunks: Type.Optional(Type.Array(Type.Ref("Chunk"), { default: [] })),
  }),
  ProcessedFileInfo: Type.Object({
    documentName: Type.String(),
    documentPath: Type.String(),
    processedJsonFileId: Type.String(),
    sourceFileId: Type.Optional(Type.Union([UUID, Type.Null()])),
    processedDocument: Type.Optional(Type.Union([Type.Ref("ProcessedDocument"), Type.Null()])),
  }),
  SummaryData: Type.Object({
    baseMetadata: Type.Optional(Type.Union([Type.Ref("BaseMetadata"), Type.Null()])),
    totalDurationSeconds: Type.Number(),
    processedFiles: Type.Array(Type.Ref("ProcessedFileInfo")),
  }),
  ProcessDocumentsWorkflowInput: Type.Object({
    fileIds: Type.Array(UUID),
    projectId: UUID,
    possibleTopics: Type.Optional(
      Type.Union([Type.Array(Type.Ref("DocumentTopic")), Type.Null()]),
    ),
  }),
  ProcessDocumentsWorkflowOutput: Type.Object({
    summaryFileId: UUID,
    summaryData: Type.Ref("SummaryData"),
    processedFileIds: Type.Array(UUID),
  }),
  ProcessDocumentsEWMSWorkflowInput: ProcessDocumentsEWMSWorkflowInputSchema,
  ChunkEWMS: ChunkEWMSSchema,
  PromptInjection: PromptInjectionSchema,
  SingleDocumentEWMSWorkflowOutput: SingleDocumentEWMSWorkflowOutputSchema,
  ProcessDocumentsEWMSWorkflowOutput: ProcessDocumentsEWMSWorkflowOutputSchema,
  EnsureQdrantInput: Type.Object({
    projectId: Type.String(),
    processedFiles: Type.Optional(
      Type.Union([Type.Array(Type.Ref("ProcessedFileInfo")), Type.Null()]),
    ),
  }),
  EnsureQdrantOutput: Type.Object({
    alreadyIndexed: Type.Optional(Type.Boolean({ default: false })),
    indexedNow: Type.Optional(Type.Boolean({ default: false })),
    processedIds: Type.Optional(Type.Array(Type.String(), { default: [] })),
    failedIds: Type.Optional(Type.Array(Type.String(), { default: [] })),
  }),
  QdrantSourceFileCleanupInput: Type.Object({
    projectId: Type.String(),
    sourceFileIds: Type.Array(Type.String()),
    marker: Type.String(),
    projectVersion: Type.Integer(),
  }),
  QdrantSourceFileCleanupOutput: Type.Object({
    processedFileIds: Type.Optional(Type.Array(Type.String(), { default: [] })),
  }),
  DeleteDocumentsWorkflowInput: Type.Object({
    projectId: UUID,
    fileIds: Type.Array(UUID),
  }),
  DeleteDocumentsWorkflowOutput: Type.Object({
    projectId: UUID,
    documentsDeleted: Type.Optional(Type.Array(Type.String(), { default: [] })),
    documentsFailed: Type.Optional(Type.Array(Type.String(), { default: [] })),
    contentExtractionsDeleted: Type.Optional(Type.Array(Type.String(), { default: [] })),
    contentExtractionsFailed: Type.Optional(Type.Array(Type.String(), { default: [] })),
    summaryUpdateSuccess: Type.Optional(Type.Array(Type.String(), { default: [] })),
    summaryUpdateFailed: Type.Optional(Type.Array(Type.String(), { default: [] })),
    qdrantDeleted: Type.Optional(Type.Array(Type.String(), { default: [] })),
    qdrantFailed: Type.Optional(Type.Array(Type.String(), { default: [] })),
  }),
});

export const BaseMetadata = contracts.Import("BaseMetadata");
export const SubChunk = contracts.Import("SubChunk");
export const PageIndexNode = contracts.Import("PageIndexNode");
export const Chunk = contracts.Import("Chunk");
export const DocumentTypeInfo = contracts.Import("DocumentTypeInfo");
export const DocumentTopic = contracts.Import("DocumentTopic");
export const Metadata = contracts.Import("Metadata");
export const ProcessedDocument = contracts.Import("ProcessedDocument");
export const ProcessedFileInfo = contracts.Import("ProcessedFileInfo");
export const SummaryData = contracts.Import("SummaryData");
export const ProcessDocumentsWorkflowInput = contracts.Import("ProcessDocumentsWorkflowInput");
export const ProcessDocumentsWorkflowOutput = contracts.Import("ProcessDocumentsWorkflowOutput");
export const ProcessDocumentsEWMSWorkflowInput = contracts.Import(
  "ProcessDocumentsEWMSWorkflowInput",
);
export const ChunkEWMS = contracts.Import("ChunkEWMS");
export const PromptInjection = contracts.Import("PromptInjection");
export const SingleDocumentEWMSWorkflowOutput = contracts.Import(
  "SingleDocumentEWMSWorkflowOutput",
);
export const ProcessDocumentsEWMSWorkflowOutput = contracts.Import(
  "ProcessDocumentsEWMSWorkflowOutput",
);
export const EnsureQdrantInput = contracts.Import("EnsureQdrantInput");
export const EnsureQdrantOutput = contracts.Import("EnsureQdrantOutput");
export const QdrantSourceFileCleanupInput = contracts.Import("QdrantSourceFileCleanupInput");
export const QdrantSourceFileCleanupOutput = contracts.Import("QdrantSourceFileCleanupOutput");
export const DeleteDocumentsWorkflowInput = contracts.Import("DeleteDocumentsWorkflowInput");
export const DeleteDocumentsWorkflowOutput = contracts.Import("DeleteDocumentsWorkflowOutput");

export type BaseMetadata = Static<typeof BaseMetadata>;
export type SubChunk = Static<typeof SubChunk>;
export type PageIndexNode = Static<typeof PageIndexNode>;
export type Chunk = Static<typeof Chunk>;
export type DocumentTypeInfo = Static<typeof DocumentTypeInfo>;
export type DocumentTopic = Static<typeof DocumentTopic>;
export type Metadata = Static<typeof Metadata>;
export type ProcessedDocument = Static<typeof ProcessedDocument>;
export type ProcessedFileInfo = Static<typeof ProcessedFileInfo>;
export type SummaryData = Static<typeof SummaryData>;
export type ProcessDocumentsWorkflowInput = Static<typeof ProcessDocumentsWorkflowInput>;
export type ProcessDocumentsWorkflowOutput = Static<typeof ProcessDocumentsWorkflowOutput>;
export type ProcessDocumentsEWMSWorkflowInput = Static<typeof ProcessDocumentsEWMSWorkflowInput>;
export type ChunkEWMS = Static<typeof ChunkEWMS>;
export type PromptInjection = Static<typeof PromptInjection>;
export type SingleDocumentEWMSWorkflowOutput = Static<typeof SingleDocumentEWMSWorkflowOutput>;
export type ProcessDocumentsEWMSWorkflowOutput = Static<typeof ProcessDocumentsEWMSWorkflowOutput>;
export type EnsureQdrantInput = Static<typeof EnsureQdrantInput>;
export type EnsureQdrantOutput = Static<typeof EnsureQdrantOutput>;
export type QdrantSourceFileCleanupInput = Static<typeof QdrantSourceFileCleanupInput>;
export type QdrantSourceFileCleanupOutput = Static<typeof QdrantSourceFileCleanupOutput>;
export type QdrantSourceFileCleanupWorkflow = (
  input: QdrantSourceFileCleanupInput,
) => Promise<QdrantSourceFileCleanupOutput>;
export type DeleteDocumentsWorkflowInput = Static<typeof DeleteDocumentsWorkflowInput>;
export type DeleteDocumentsWorkflowOutput = Static<typeof DeleteDocumentsWorkflowOutput>;
