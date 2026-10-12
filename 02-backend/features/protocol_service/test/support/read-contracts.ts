import {type Static, type TSchema, Type as T} from "@sinclair/typebox";
import type {HttpJson} from "@spark-workflow/http-host";
import {Value} from "@sinclair/typebox/value";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const TimestampSchema = T.String({
  pattern:
    "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$",
});
const NullableStringSchema = T.Union([T.String(), T.Null()]);
const NullableUuidSchema = T.Union([UuidSchema, T.Null()]);

export const ProtocolServiceSchema = T.Union([
  T.Literal("project_logic"),
  T.Literal("formal_completeness"),
  T.Literal("comment"),
  T.Literal("supplementary"),
  T.Literal("plausibility"),
  T.Literal("document_management"),
  T.Literal("administrative_draft"),
  T.Literal("examination"),
  T.Literal("objections_management"),
]);

export const HistoryItemSchema = T.Object(
  {
    timestamp: TimestampSchema,
    entityType: T.String({ minLength: 1 }),
    entityId: NullableUuidSchema,
    service: ProtocolServiceSchema,
    serviceLabel: T.String({ minLength: 1 }),
    changeType: T.Union([
      T.Literal("create"),
      T.Literal("update"),
      T.Literal("delete"),
      T.Literal("action"),
    ]),
    source: T.Union([T.Literal("user"), T.Literal("agent")]),
    actorUserId: NullableUuidSchema,
    triggeredByUserId: NullableUuidSchema,
    workflowRunId: NullableStringSchema,
    workflowType: NullableStringSchema,
    actionType: NullableStringSchema,
    requestId: NullableStringSchema,
    oldRow: T.Union([T.Object({}, { additionalProperties: true }), T.Null()]),
    newRow: T.Union([T.Object({}, { additionalProperties: true }), T.Null()]),
    groupCount: T.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const HistoryResponseSchema = T.Object(
  {
    total: T.Integer({ minimum: 0 }),
    limit: T.Integer({ minimum: 1, maximum: 500 }),
    offset: T.Integer({ minimum: 0 }),
    items: T.Array(HistoryItemSchema),
  },
  { additionalProperties: false },
);

export const HistoryExportSchema = T.Object(
  {
    projectId: UuidSchema,
    total: T.Integer({ minimum: 0 }),
    items: T.Array(HistoryItemSchema),
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
