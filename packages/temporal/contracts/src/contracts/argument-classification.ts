import { Type, type Static } from "@sinclair/typebox";

import {
  ChunkEWMSSchema,
  PromptInjectionSchema,
  SingleDocumentEWMSWorkflowOutputSchema,
} from "./inhaltsextraktion.js";
import { GeneratedUUID, UUID, type WorkflowName } from "../registry.js";

export const EINWENDUNGSMANAGEMENT_TASK_QUEUE = "einwendungsmanagement" as const;
export const EINWENDUNGSMANAGEMENT_ARGUMENT_EXTRACTION_WORKFLOW =
  "argument-extraction-workflow" as WorkflowName<"argument-extraction-workflow">;
export const EINWENDUNGSMANAGEMENT_ARGUMENT_CLASSIFICATION_WORKFLOW =
  "argument-classification-workflow" as WorkflowName<"argument-classification-workflow">;

const contracts = Type.Module({
  GeneratedUUID,
  TextSpan: Type.Object({ startIdx: Type.Integer(), endIdx: Type.Integer() }),
  Segment: Type.Object({ text: Type.String(), span: Type.Ref("TextSpan") }),
  ExtractedArgument: Type.Object({
    argument: Type.Ref("Segment"),
    description: Type.String(),
    context: Type.Ref("Segment"),
  }),
  ChunkEWMS: ChunkEWMSSchema,
  PromptInjection: PromptInjectionSchema,
  SingleDocumentEWMSWorkflowOutput: SingleDocumentEWMSWorkflowOutputSchema,
  ArgumentExtractionParams: Type.Object({
    processedFilesOutput: Type.Array(Type.Ref("SingleDocumentEWMSWorkflowOutput")),
  }),
  ChunkArguments: Type.Object({
    chunk: Type.Ref("ChunkEWMS"),
    arguments: Type.Array(Type.Ref("ExtractedArgument")),
  }),
  DocumentArguments: Type.Object({
    documentId: Type.String(),
    chunkArguments: Type.Array(Type.Ref("ChunkArguments")),
  }),
  ArgumentExtractionOutput: Type.Object({
    documentArguments: Type.Array(Type.Ref("DocumentArguments")),
  }),
  ArgumentRecord: Type.Object({
    argumentId: UUID,
    extractedArgument: Type.Ref("ExtractedArgument"),
  }),
  ArgumentSubtopic: Type.Object({
    topicId: UUID,
    name: Type.String(),
    description: Type.String(),
  }),
  ArgumentTopic: Type.Object({
    topicId: UUID,
    name: Type.String(),
    description: Type.String(),
    subtopics: Type.Array(Type.Ref("ArgumentSubtopic")),
  }),
  ArgumentClassificationParams: Type.Object({
    argumentRecords: Type.Array(Type.Ref("ArgumentRecord")),
    topics: Type.Array(Type.Ref("ArgumentTopic")),
  }),
  ClassifiedArgument: Type.Object({
    argumentRecord: Type.Ref("ArgumentRecord"),
    topic: Type.Union([Type.Ref("ArgumentTopic"), Type.Null()]),
    subtopic: Type.Union([Type.Ref("ArgumentSubtopic"), Type.Null()]),
    reasoning: Type.String(),
    confidence: Type.Number({ minimum: 0, maximum: 1 }),
    topicConfidence: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
    subtopicConfidence: Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
  }),
  ArgumentClassificationOutput: Type.Object({
    classifiedArguments: Type.Array(Type.Ref("ClassifiedArgument")),
  }),
});

export const TextSpan = contracts.Import("TextSpan");
export const Segment = contracts.Import("Segment");
export const ExtractedArgument = contracts.Import("ExtractedArgument");
export const ArgumentExtractionParams = contracts.Import("ArgumentExtractionParams");
export const ChunkArguments = contracts.Import("ChunkArguments");
export const DocumentArguments = contracts.Import("DocumentArguments");
export const ArgumentExtractionOutput = contracts.Import("ArgumentExtractionOutput");
export const ArgumentRecord = contracts.Import("ArgumentRecord");
export const ArgumentSubtopic = contracts.Import("ArgumentSubtopic");
export const ArgumentTopic = contracts.Import("ArgumentTopic");
export const ArgumentClassificationParams = contracts.Import("ArgumentClassificationParams");
export const ClassifiedArgument = contracts.Import("ClassifiedArgument");
export const ArgumentClassificationOutput = contracts.Import("ArgumentClassificationOutput");

export type TextSpan = Static<typeof TextSpan>;
export type Segment = Static<typeof Segment>;
export type ExtractedArgument = Static<typeof ExtractedArgument>;
export type ArgumentExtractionParams = Static<typeof ArgumentExtractionParams>;
export type ChunkArguments = Static<typeof ChunkArguments>;
export type DocumentArguments = Static<typeof DocumentArguments>;
export type ArgumentExtractionOutput = Static<typeof ArgumentExtractionOutput>;
export type ArgumentRecord = Static<typeof ArgumentRecord>;
export type ArgumentSubtopic = Static<typeof ArgumentSubtopic>;
export type ArgumentTopic = Static<typeof ArgumentTopic>;
export type ArgumentClassificationParams = Static<typeof ArgumentClassificationParams>;
export type ClassifiedArgument = Static<typeof ClassifiedArgument>;
export type ArgumentClassificationOutput = Static<typeof ArgumentClassificationOutput>;
