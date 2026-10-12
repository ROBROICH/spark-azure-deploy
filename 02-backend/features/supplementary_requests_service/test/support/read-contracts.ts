import {type Static, type TSchema, Type as T} from "@sinclair/typebox";
import type {HttpJson} from "@spark-workflow/http-host";
import {Value} from "@sinclair/typebox/value";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const TimestampSchema = T.Transform(
  T.String({
    pattern:
      "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$",
  }),
)
  .Decode((value) => new Date(value).toISOString())
  .Encode((value) => value);
const NullableUuidSchema = T.Union([UuidSchema, T.Null()]);
const SourceTypeSchema = T.Union([
  T.Literal("tableOfContents"),
  T.Literal("requiredDocuments"),
  T.Literal("contradiction"),
  T.Literal("materialLaw"),
  T.Literal("materialNorm"),
  T.Literal("materialSatz"),
  T.Literal("materialFundstelle"),
  T.Literal("manual"),
]);

const SourceRefSchema = T.Object(
  {
    type: SourceTypeSchema,
    itemId: T.String({ minLength: 1, maxLength: 255 }),
  },
  { additionalProperties: false },
);

export const SupplementaryRequestResponseSchema = T.Object(
  {
    id: UuidSchema,
    projectId: UuidSchema,
    title: T.String({ minLength: 1, maxLength: 2000 }),
    reason: T.String({ maxLength: 2000 }),
    priority: T.Union([T.Literal("must"), T.Literal("should")]),
    sourceRef: T.Union([SourceRefSchema, T.Null()]),
    includedInLetter: T.Boolean(),
    topicId: NullableUuidSchema,
    documentId: NullableUuidSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export const SupplementaryRequestListSchema = T.Array(SupplementaryRequestResponseSchema);

const ValidationErrorItemSchema = T.Object(
  {
    type: T.String({ minLength: 1 }),
    loc: T.Array(T.Union([T.String(), T.Integer()])),
    msg: T.String({ minLength: 1 }),
    input: T.Unknown(),
  },
  { additionalProperties: false },
);

export const ErrorResponseSchema = T.Object(
  {
    detail: T.Union([
      T.String({ minLength: 1 }),
      T.Array(ValidationErrorItemSchema, { minItems: 1 }),
    ]),
  },
  { additionalProperties: false },
);

export function parseReadContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
