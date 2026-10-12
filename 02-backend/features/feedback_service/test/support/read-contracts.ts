import {type Static, type TSchema, Type as T} from "@sinclair/typebox";
import type {HttpJson} from "@spark-workflow/http-host";
import {Value} from "@sinclair/typebox/value";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const TimestampSchema = T.String({
  pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?Z$",
});
const SystemPeriodSchema = T.String({
  pattern:
    '^\\["[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]{1,6})?\\+00",\\)$',
});
const ParentSchema = T.Object(
  { id: UuidSchema, nodeType: T.Literal("feedback") },
  { additionalProperties: false },
);
const NodeSummarySchema = T.Object(
  {
    id: UuidSchema,
    nodeType: T.Literal("feedback"),
    parents: T.Array(ParentSchema),
    frontendParentIds: T.Array(T.String()),
    isOutdated: T.Boolean(),
  },
  { additionalProperties: false },
);

export const NodeListSchema = T.Object(
  { nodes: T.Array(NodeSummarySchema) },
  { additionalProperties: false },
);

const FeedbackNodeSchema = T.Object(
  {
    nodeType: T.Literal("feedback"),
    isDeleted: T.Boolean(),
    rating: T.Union([T.Literal("positive"), T.Literal("negative")]),
    reason: T.Union([T.String({ maxLength: 30 }), T.Null()]),
    text: T.Union([T.String({ maxLength: 5000 }), T.Null()]),
    userId: UuidSchema,
    id: UuidSchema,
    projectId: UuidSchema,
    isOutdated: T.Boolean(),
    frontendParentIds: T.Array(T.String()),
    projectVersion: T.Integer(),
    updateType: T.Union([T.Literal("automated"), T.Literal("manual"), T.Null()]),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
    sysPeriod: SystemPeriodSchema,
  },
  { additionalProperties: false },
);

export const BatchNodesResponseSchema = T.Object(
  { results: T.Array(FeedbackNodeSchema) },
  { additionalProperties: false },
);

const SYSTEM_PERIOD =
  /^\["([0-9]{4}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?)\+00",\)$/;
const SYSTEM_PERIOD_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;
const SYSTEM_PERIOD_SENTINEL = '["<database-period-start>",)';

export function stabilizeBatchResponseForSnapshot(
  body: Static<typeof BatchNodesResponseSchema>,
  observationTimeMs = Date.now(),
) {
  return {
    results: body.results.map((node) => {
      const match = SYSTEM_PERIOD.exec(node.sysPeriod);
      if (match === null) {
        throw new TypeError(
          "Feedback sys_period is not a lower-bounded, open-ended PostgreSQL range",
        );
      }

      const createdAt = Date.parse(node.createdAt);
      const periodStart = Date.parse(`${match[1].replace(" ", "T")}Z`);
      const updatedAt = Date.parse(node.updatedAt);
      if (
        !Number.isFinite(createdAt) ||
        !Number.isFinite(periodStart) ||
        !Number.isFinite(updatedAt)
      ) {
        throw new TypeError("Feedback timestamps are not valid");
      }
      if (periodStart < updatedAt) {
        throw new RangeError("Feedback sys_period start precedes updated_at");
      }
      if (periodStart > observationTimeMs + SYSTEM_PERIOD_FUTURE_TOLERANCE_MS) {
        throw new RangeError("Feedback sys_period start is after the observation window");
      }

      return {
        ...node,
        createdAt: new Date(createdAt).toISOString(),
        updatedAt: new Date(updatedAt).toISOString(),
        sysPeriod: SYSTEM_PERIOD_SENTINEL,
      };
    }),
  };
}

export function parseReadContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
