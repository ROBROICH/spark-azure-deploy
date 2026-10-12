import { Type, type Static } from "@sinclair/typebox";
import { t } from "elysia";

const MAX_TEXT_LENGTH = 50_000;
const MAX_NAME_LENGTH = 1_000;
const MAX_ITEMS = 1_000;

export const UuidSchema = Type.String({ format: "uuid" });
export const ProjectParamsSchema = Type.Object(
  { projectId: UuidSchema },
  { additionalProperties: false },
);
export const RequiredVersionQuerySchema = Type.Object(
  { projectVersion: t.Numeric({ minimum: 1 }) },
  { additionalProperties: false },
);

const TextSchema = Type.String({ maxLength: MAX_TEXT_LENGTH });
const SpanSchema = Type.Object(
  { startIdx: Type.Integer({ minimum: 0 }), endIdx: Type.Integer({ minimum: 0 }) },
  { additionalProperties: false },
);
const TextSegmentSchema = Type.Object(
  { text: TextSchema, span: SpanSchema },
  { additionalProperties: false },
);
export const ExtractedArgumentSchema = Type.Object(
  {
    argument: TextSegmentSchema,
    description: TextSchema,
    context: TextSegmentSchema,
  },
  { additionalProperties: false },
);
export type ExtractedArgument = Static<typeof ExtractedArgumentSchema>;
const ChunkArgumentsSchema = Type.Object(
  {
    chunk: Type.Object(
      {
        chunkId: Type.String({ maxLength: MAX_NAME_LENGTH }),
        pageContent: TextSchema,
        pageNumbers: Type.Array(Type.Integer(), { maxItems: MAX_ITEMS }),
      },
      { additionalProperties: false },
    ),
    arguments: Type.Array(ExtractedArgumentSchema, { maxItems: MAX_ITEMS }),
  },
  { additionalProperties: false },
);
export const ArgumentExtractionBodySchema = Type.Object(
  {
    documentArguments: Type.Array(
      Type.Object(
        {
          documentId: UuidSchema,
          documentName: Type.String({ maxLength: MAX_NAME_LENGTH }),
          chunkArguments: Type.Array(ChunkArgumentsSchema, { maxItems: MAX_ITEMS }),
          beteiligungsEingangMarkdown: Type.Optional(Type.Union([TextSchema, Type.Null()])),
        },
        { additionalProperties: false },
      ),
      { maxItems: MAX_ITEMS },
    ),
  },
  { additionalProperties: false },
);
export type ArgumentExtractionBody = Static<typeof ArgumentExtractionBodySchema>;
export type ArgumentExtractionResponse = Static<typeof ArgumentExtractionResponseSchema>;

export const ClassificationBodySchema = Type.Object(
  {
    classifiedArguments: Type.Array(
      Type.Object(
        {
          argumentId: UuidSchema,
          topicId: UuidSchema,
          subTopicId: Type.Optional(Type.Union([UuidSchema, Type.Null()])),
          topicConfidence: Type.Optional(
            Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
          ),
          subTopicConfidence: Type.Optional(
            Type.Union([Type.Number({ minimum: 0, maximum: 1 }), Type.Null()]),
          ),
        },
        { additionalProperties: false },
      ),
      { maxItems: MAX_ITEMS },
    ),
    unclassifiedArgumentIds: Type.Optional(
      Type.Array(UuidSchema, { default: [], maxItems: MAX_ITEMS }),
    ),
  },
  { additionalProperties: false },
);
export type ClassificationBody = Static<typeof ClassificationBodySchema>;

export const ClassificationFailedBodySchema = Type.Object(
  { beteiligungsEingangIds: Type.Array(UuidSchema, { maxItems: MAX_ITEMS }) },
  { additionalProperties: false },
);
export type ClassificationFailedBody = Static<typeof ClassificationFailedBodySchema>;

export const InjectionDetectedBodySchema = Type.Object(
  {
    documents: Type.Array(
      Type.Object(
        {
          fileId: UuidSchema,
          documentName: Type.String({ maxLength: MAX_NAME_LENGTH }),
          snippet: Type.Optional(Type.Union([TextSchema, Type.Null()])),
        },
        { additionalProperties: false },
      ),
      { maxItems: MAX_ITEMS },
    ),
  },
  { additionalProperties: false },
);
export type InjectionDetectedBody = Static<typeof InjectionDetectedBodySchema>;

export const FileIdBodySchema = Type.Object(
  { fileId: UuidSchema },
  { additionalProperties: false },
);
export const ProcessedFileIdsResponseSchema = Type.Object(
  { fileIds: Type.Array(UuidSchema) },
  { additionalProperties: false },
);
export const ArgumentExtractionResponseSchema = Type.Object(
  {
    results: Type.Array(
      Type.Object(
        {
          documentId: UuidSchema,
          beteiligungsEingangId: UuidSchema,
          arguments: Type.Array(
            Type.Object(
              { argumentId: UuidSchema, extractedArgument: ExtractedArgumentSchema },
              { additionalProperties: false },
            ),
          ),
          skipped: Type.Boolean(),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export const UpdatedCountResponseSchema = Type.Object(
  { updatedCount: Type.Integer({ minimum: 0 }) },
  { additionalProperties: false },
);
export const ImportArgumentsResponseSchema = Type.Object(
  {
    updated: Type.Integer({ minimum: 0 }),
    skipped: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
