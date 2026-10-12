import { Type as T } from "@sinclair/typebox";
import { t } from "elysia";

const MAX_CONTENT_LENGTH = 50_000;

export const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});

export const UuidInputSchema = T.String({
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
});

export const ProcessStepSchema = T.Union([
  T.Literal("unsorted"),
  T.Literal("formalCompletenessCheck"),
  T.Literal("plausibilityCheck"),
  T.Literal("materialCompletenessCheck"),
  T.Literal("legalReview"),
]);

export const SourceTypeSchema = T.Union([
  T.Literal("tableOfContents"),
  T.Literal("requiredDocuments"),
  T.Literal("contradiction"),
  T.Literal("materialLaw"),
  T.Literal("materialNorm"),
  T.Literal("materialSatz"),
  T.Literal("materialFundstelle"),
  T.Literal("manual"),
]);

const ReferencedSourceTypeSchema = T.Exclude(SourceTypeSchema, T.Literal("manual"));

export const SourceRefInputSchema = T.Union([
  T.Object(
    {
      type: T.Literal("manual"),
      itemId: T.Optional(T.Union([T.String({ maxLength: 255 }), T.Null()])),
    },
    { additionalProperties: false },
  ),
  T.Object(
    {
      type: ReferencedSourceTypeSchema,
      itemId: T.String({ minLength: 1, maxLength: 255 }),
    },
    { additionalProperties: false },
  ),
]);

export const SourceRefResponseSchema = T.Union([
  T.Object(
    {
      type: T.Literal("manual"),
      itemId: T.Union([T.String({ maxLength: 255 }), T.Null()]),
    },
    { additionalProperties: false },
  ),
  T.Object(
    {
      type: ReferencedSourceTypeSchema,
      itemId: T.String({ minLength: 1, maxLength: 255 }),
    },
    { additionalProperties: false },
  ),
]);

export const CommentResponseSchema = T.Object(
  {
    id: UuidSchema,
    projectId: UuidSchema,
    title: T.String({ minLength: 1, maxLength: 255 }),
    content: T.String({ minLength: 1 }),
    processStep: ProcessStepSchema,
    sourceRef: T.Union([SourceRefResponseSchema, T.Null()]),
    createdAt: t.Date(),
    updatedAt: t.Date(),
  },
  { additionalProperties: false },
);

export const CommentListSchema = T.Array(CommentResponseSchema);

export const CreateCommentBodySchema = T.Object(
  {
    title: T.String({ minLength: 1, maxLength: 255 }),
    content: T.String({ minLength: 1, maxLength: MAX_CONTENT_LENGTH }),
    processStep: ProcessStepSchema,
    sourceRef: T.Optional(T.Union([SourceRefInputSchema, T.Null()])),
  },
  { additionalProperties: false },
);

export const UpdateCommentBodySchema = T.Object(
  {
    title: T.Optional(T.String({ minLength: 1, maxLength: 255 })),
    content: T.Optional(T.String({ minLength: 1, maxLength: MAX_CONTENT_LENGTH })),
    processStep: T.Optional(ProcessStepSchema),
    sourceRef: T.Optional(T.Union([SourceRefInputSchema, T.Null()])),
  },
  { additionalProperties: false },
);
