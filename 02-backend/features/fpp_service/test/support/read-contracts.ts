import {type Static, type TSchema, Type as T} from "@sinclair/typebox";
import type {HttpJson} from "@spark-workflow/http-host";
import {Value} from "@sinclair/typebox/value";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const DateSchema = T.String({ pattern: "^20[0-9]{2}-[0-9]{2}-[0-9]{2}$" });
const TimestampSchema = T.Transform(T.String({ pattern: "^20[0-9]{2}-[0-9]{2}-[0-9]{2}T" }))
  .Decode((value) => new Date(value).toISOString().replace(/\.000Z$/, "Z"))
  .Encode((value) => value);
const NullableStringSchema = T.Union([T.String(), T.Null()]);
const NullableUuidSchema = T.Union([UuidSchema, T.Null()]);

const RequestStatusSchema = T.Union([
  T.Literal("RECEIVED"),
  T.Literal("IMPORTING"),
  T.Literal("IMPORTED"),
  T.Literal("FAILED"),
]);
const FileTypeSchema = T.Union([T.Literal("PLANUNTERLAGEN"), T.Literal("ERGAENZENDE_UNTERLAGEN")]);

export const FppFileResponseSchema = T.Object(
  {
    id: UuidSchema,
    fileType: FileTypeSchema,
    fileUrl: T.String({ minLength: 1 }),
    fileName: NullableStringSchema,
    createdAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export const FppFileListSchema = T.Array(FppFileResponseSchema);

export const FppRequestDetailSchema = T.Object(
  {
    requestId: UuidSchema,
    internalProjectId: T.String({ minLength: 1 }),
    name: T.String({ minLength: 1 }),
    entryDate: DateSchema,
    xml: T.String({ minLength: 1 }),
    state: NullableStringSchema,
    company: NullableStringSchema,
    addressCombined: NullableStringSchema,
    street: NullableStringSchema,
    houseNumber: NullableStringSchema,
    plz: NullableStringSchema,
    location: NullableStringSchema,
    country: NullableStringSchema,
    email: NullableStringSchema,
    phone: NullableStringSchema,
    fax: NullableStringSchema,
    projectId: NullableUuidSchema,
    status: RequestStatusSchema,
    files: FppFileListSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  },
  { additionalProperties: false },
);

export const ErrorResponseSchema = T.Object(
  { detail: T.String({ minLength: 1 }) },
  { additionalProperties: false },
);

export function parseReadContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
