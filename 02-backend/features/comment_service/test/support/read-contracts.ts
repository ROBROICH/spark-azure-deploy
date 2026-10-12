import { type Static, type TSchema, Type as T } from "@sinclair/typebox";
import type { HttpJson } from "@spark-workflow/http-host";
import { Value } from "@sinclair/typebox/value";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const TimestampSchema = T.String({
  pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?Z$",
});

const ProcessStepSchema = T.Union([
  T.Literal("unsorted"),
  T.Literal("formalCompletenessCheck"),
  T.Literal("plausibilityCheck"),
  T.Literal("materialCompletenessCheck"),
  T.Literal("legalReview"),
]);
const ReferencedSourceTypeSchema = T.Union([
  T.Literal("tableOfContents"),
  T.Literal("requiredDocuments"),
  T.Literal("contradiction"),
  T.Literal("materialLaw"),
  T.Literal("materialNorm"),
  T.Literal("materialSatz"),
  T.Literal("materialFundstelle"),
]);
const SourceRefSchema = T.Union([
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
const CommentSchema = T.Object(
  {
    id: UuidSchema,
    projectId: UuidSchema,
    title: T.String({ minLength: 1 }),
    content: T.String({ minLength: 1 }),
    processStep: ProcessStepSchema,
    sourceRef: T.Union([SourceRefSchema, T.Null()]),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export const CommentListSchema = T.Array(CommentSchema);

const ValidationErrorItemSchema = T.Object(
  {
    type: T.String({ minLength: 1 }),
    loc: T.Array(T.Union([T.String(), T.Integer()])),
    msg: T.String({ minLength: 1 }),
  },
  { additionalProperties: true },
);

export const ValidationErrorResponseSchema = T.Object(
  { detail: T.Array(ValidationErrorItemSchema, { minItems: 1 }) },
  { additionalProperties: false },
);

export function parseReadContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
