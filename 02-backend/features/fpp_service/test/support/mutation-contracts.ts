import { type Static, type TSchema, Type as T } from "@sinclair/typebox";
import type { HttpJson } from "@spark-workflow/http-host";
import { Value } from "@sinclair/typebox/value";

export const MutationUuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
export const MutationTimestampSchema = T.String({
  pattern:
    "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{1,6})?(?:Z|[+-][0-9]{2}:[0-9]{2})$",
});

export const FppMutationStatusSchema = T.Union([
  T.Literal("RECEIVED"),
  T.Literal("IMPORTING"),
  T.Literal("IMPORTED"),
  T.Literal("FAILED"),
]);

export const FppProjectMutationResponseSchema = T.Object(
  {
    requestId: MutationUuidSchema,
    internalProjectId: T.String({ minLength: 1 }),
    name: T.String({ minLength: 1 }),
    status: FppMutationStatusSchema,
    createdAt: MutationTimestampSchema,
    updatedAt: MutationTimestampSchema,
  },
  { additionalProperties: false },
);

export const ConfirmDownloadResponseSchema = T.Object(
  {
    status: T.Literal("confirmed"),
    fileId: MutationUuidSchema,
    dmsFileId: MutationUuidSchema,
  },
  { additionalProperties: false },
);

export const MutationDetailErrorSchema = T.Object(
  { detail: T.String({ minLength: 1 }) },
  { additionalProperties: false },
);

export const MutationInternalTextErrorSchema = T.Union([
  T.Literal("Internal Server Error"),
  T.Object({ detail: T.Literal("Internal server error") }, { additionalProperties: false }),
]);

const ValidationLocationPartSchema = T.Union([T.String(), T.Number()]);
const ValidationDetailSchema = T.Object(
  {
    type: T.String({ minLength: 1 }),
    loc: T.Array(ValidationLocationPartSchema, { minItems: 1 }),
    msg: T.String({ minLength: 1 }),
    url: T.Optional(T.String()),
  },
  { additionalProperties: true },
);

export const MutationValidationErrorSchema = T.Object(
  { detail: T.Array(ValidationDetailSchema, { minItems: 1 }) },
  { additionalProperties: false },
);

export function parseMutationContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
