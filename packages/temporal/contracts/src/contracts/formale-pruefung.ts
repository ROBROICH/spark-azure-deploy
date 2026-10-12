import { type Static, Type } from "@sinclair/typebox";

import type { WorkflowName } from "../registry.js";
import { DMSFileResponseSchema } from "./document-management-temporal.js";

export const FORMALE_PRUEFUNG_TASK_QUEUE = "formale-pruefung" as const;
export const FORMALE_PRUEFUNG_INHALTSVERZEICHNIS_FINDER_WORKFLOW =
  "InhaltsverzeichnisFinderWorkflow" as WorkflowName<"InhaltsverzeichnisFinderWorkflow">;
export const FORMALE_PRUEFUNG_INHALTSVERZEICHNIS_MATCHING_WORKFLOW =
  "InhaltsverzeichnisMatchingWorkflow" as WorkflowName<"InhaltsverzeichnisMatchingWorkflow">;
export const FORMALE_PRUEFUNG_LLM_MATCHING_WORKFLOW =
  "LLMMatchingWorkflow" as WorkflowName<"LLMMatchingWorkflow">;

const documentTypeDefinition = Type.Object(
  {
    category: Type.Optional(Type.Union([Type.String(), Type.Null()], { default: null })),
    documentTypeName: Type.String(),
    documentTypeDescription: Type.String(),
  },
  { $id: "DocumentTypeDefinition" },
);
const documentTypeInput = Type.Array(Type.Ref(documentTypeDefinition), {
  $id: "DocumentTypeInput",
});
const categorizedDocumentTypeInput = Type.Array(Type.Required(documentTypeDefinition), {
  $id: "CategorizedDocumentTypeInput",
});
const llmMatchingParams = Type.Object(
  {
    projectId: Type.String(),
    documentTypes: Type.Ref(documentTypeInput),
    documentIds: Type.Optional(
      Type.Union([Type.Array(Type.String()), Type.Null()], { default: null }),
    ),
  },
  { $id: "LLMMatchingParams" },
);
const documentOutput = Type.Object(
  {
    documentName: Type.String(),
    documentId: Type.String(),
    documentExtractionId: Type.String(),
    reasoning: Type.String(),
    confidence: Type.Number(),
  },
  { $id: "DocumentOutput", additionalProperties: false },
);
const matchedDocumentTypeOutput = Type.Object(
  {
    requiredDocumentType: Type.Ref(documentTypeDefinition),
    assignedDocuments: Type.Array(Type.Ref(documentOutput)),
    confidence: Type.Number(),
  },
  { $id: "MatchedDocumentTypeOutput", additionalProperties: false },
);
const llmMatchingOutput = Type.Object(
  {
    matchedDocumentTypes: Type.Array(Type.Ref(matchedDocumentTypeOutput)),
    unassignedDocuments: Type.Array(Type.Ref(documentOutput)),
  },
  { $id: "LLMMatchingOutput", additionalProperties: false },
);
const inhaltsverzeichnisEntry = Type.Object(
  {
    hierarchyPath: Type.Optional(Type.Array(Type.String(), { default: [] })),
    entryTitle: Type.String(),
    entryNumber: Type.Optional(Type.Union([Type.String(), Type.Null()], { default: null })),
  },
  { $id: "InhaltsverzeichnisEntry", additionalProperties: false },
);
const chunkOutput = Type.Object(
  { chunkId: Type.String(), pageContent: Type.String() },
  { $id: "ChunkOutput", additionalProperties: false },
);
const inhaltsverzeichnisDocumentData = Type.Object(
  {
    documentId: Type.String(),
    documentName: Type.String(),
    chunks: Type.Array(Type.Ref(chunkOutput)),
  },
  { $id: "InhaltsverzeichnisDocumentData", additionalProperties: false },
);
const inhaltsverzeichnisFinderParams = Type.Object(
  { projectId: Type.String(), documentTypes: Type.Ref(documentTypeInput) },
  { $id: "InhaltsverzeichnisFinderParams" },
);
const inhaltsverzeichnisFinderOutput = Type.Object(
  {
    status: Type.Union([Type.Literal("success"), Type.Literal("no_inhaltsverzeichnis_found")]),
    metadata: Type.Optional(
      Type.Union([Type.Ref(inhaltsverzeichnisDocumentData), Type.Null()], { default: null }),
    ),
    documentTypes: Type.Optional(
      Type.Union([Type.Array(Type.Ref(documentTypeDefinition)), Type.Null()], { default: null }),
    ),
    inhaltsverzeichnisEntries: Type.Optional(
      Type.Union([Type.Array(Type.Ref(inhaltsverzeichnisEntry)), Type.Null()], {
        default: null,
      }),
    ),
  },
  { $id: "InhaltsverzeichnisFinderOutput", additionalProperties: false },
);
const inhaltsverzeichnisMatchingParams = Type.Object(
  { projectId: Type.String(), documentTypes: Type.Ref(documentTypeInput) },
  { $id: "InhaltsverzeichnisMatchingParams" },
);
const inhaltsverzeichnisMatchingOutput = Type.Object(
  {
    inhaltsverzeichnisExtractionOutput: Type.Ref(inhaltsverzeichnisFinderOutput),
    inhaltsverzeichnisMatchingOutput: Type.Ref(llmMatchingOutput),
  },
  { $id: "InhaltsverzeichnisMatchingOutput", additionalProperties: false },
);

const contracts = Type.Module({
  DMSFileResponse: DMSFileResponseSchema,
  DocumentTypeDefinition: documentTypeDefinition,
  DocumentTypeInput: documentTypeInput,
  CategorizedDocumentTypeInput: categorizedDocumentTypeInput,
  LLMMatchingParams: llmMatchingParams,
  DocumentOutput: documentOutput,
  MatchedDocumentTypeOutput: matchedDocumentTypeOutput,
  LLMMatchingOutput: llmMatchingOutput,
  InhaltsverzeichnisEntry: inhaltsverzeichnisEntry,
  ChunkOutput: chunkOutput,
  InhaltsverzeichnisDocumentData: inhaltsverzeichnisDocumentData,
  InhaltsverzeichnisFinderParams: inhaltsverzeichnisFinderParams,
  InhaltsverzeichnisFinderOutput: inhaltsverzeichnisFinderOutput,
  InhaltsverzeichnisMatchingParams: inhaltsverzeichnisMatchingParams,
  InhaltsverzeichnisMatchingOutput: inhaltsverzeichnisMatchingOutput,
});

export const DocumentTypeDefinition = contracts.Import("DocumentTypeDefinition");
export const DocumentTypeInput = contracts.Import("DocumentTypeInput");
export const CategorizedDocumentTypeInput = contracts.Import("CategorizedDocumentTypeInput");
export const LLMMatchingParams = contracts.Import("LLMMatchingParams");
export const DocumentOutput = contracts.Import("DocumentOutput");
export const MatchedDocumentTypeOutput = contracts.Import("MatchedDocumentTypeOutput");
export const LLMMatchingOutput = contracts.Import("LLMMatchingOutput");
export const InhaltsverzeichnisEntry = contracts.Import("InhaltsverzeichnisEntry");
export const ChunkOutput = contracts.Import("ChunkOutput");
export const InhaltsverzeichnisDocumentData = contracts.Import("InhaltsverzeichnisDocumentData");
export const InhaltsverzeichnisFinderParams = contracts.Import("InhaltsverzeichnisFinderParams");
export const InhaltsverzeichnisFinderOutput = contracts.Import("InhaltsverzeichnisFinderOutput");
export const InhaltsverzeichnisMatchingParams = contracts.Import(
  "InhaltsverzeichnisMatchingParams",
);
export const InhaltsverzeichnisMatchingOutput = contracts.Import(
  "InhaltsverzeichnisMatchingOutput",
);

export type DocumentTypeDefinition = Static<typeof documentTypeDefinition>;
export type DocumentTypeInput = Static<typeof documentTypeInput>;
export type CategorizedDocumentTypeInput = Static<typeof categorizedDocumentTypeInput>;
export type LLMMatchingParams = Static<typeof llmMatchingParams>;
export type DocumentOutput = Static<typeof documentOutput>;
export type MatchedDocumentTypeOutput = Static<typeof matchedDocumentTypeOutput>;
export type LLMMatchingOutput = Static<typeof llmMatchingOutput>;
export type InhaltsverzeichnisEntry = Static<typeof inhaltsverzeichnisEntry>;
export type ChunkOutput = Static<typeof chunkOutput>;
export type InhaltsverzeichnisDocumentData = Static<typeof inhaltsverzeichnisDocumentData>;
export type InhaltsverzeichnisFinderParams = Static<typeof inhaltsverzeichnisFinderParams>;
export type InhaltsverzeichnisFinderOutput = Static<typeof inhaltsverzeichnisFinderOutput>;
export type InhaltsverzeichnisMatchingParams = Static<typeof inhaltsverzeichnisMatchingParams>;
export type InhaltsverzeichnisMatchingOutput = Static<typeof inhaltsverzeichnisMatchingOutput>;
