import { type Static, type TSchema, Type as T } from "@sinclair/typebox"
import type { HttpJson } from "@spark-workflow/http-host"
import { Value } from "@sinclair/typebox/value"

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
})
const TimestampSchema = T.String({
  pattern:
    "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$",
})
const NullableStringSchema = T.Union([T.String(), T.Null()])
const NullableUuidSchema = T.Union([UuidSchema, T.Null()])
const NullableTimestampSchema = T.Union([TimestampSchema, T.Null()])

export const TemporalStatusSchema = T.Union([
  T.Literal("running"),
  T.Literal("completed"),
  T.Literal("failed"),
  T.Literal("canceled"),
  T.Literal("terminated"),
  T.Literal("timed_out"),
  T.Literal("continued_as_new"),
  T.Literal("pending"),
])


const ErrorCodeSchema = T.String({ pattern: "^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$" })

const WorkflowFailureSchema = T.Object(
  {
    errorCode: ErrorCodeSchema,
    branches: T.Array(
      T.Object(
        { branch: T.String({ minLength: 1 }), errorCode: ErrorCodeSchema },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
)

export const WorkflowSummarySchema = T.Object(
  {
    workflowId: T.String({ minLength: 1 }),
    runId: T.String({ minLength: 1 }),
    projectId: NullableUuidSchema,
    projectVersion: T.Union([T.Integer({ minimum: 1 }), T.Null()]),
    workflowType: T.String({ minLength: 1 }),
    status: T.Union([TemporalStatusSchema, T.Null()]),
    workflowStartTime: NullableTimestampSchema,
    workflowCloseTime: NullableTimestampSchema,
    failure: T.Union([WorkflowFailureSchema, T.Null()]),
  },
  { additionalProperties: false },
)

export const WorkflowsResponseSchema = T.Object(
  {
    retrievedWorkflows: T.Integer({ minimum: 0 }),
    workflows: T.Array(WorkflowSummarySchema),
    nextPageToken: NullableStringSchema,
  },
  { additionalProperties: false },
)

export const WorkflowsByTypeResponseSchema = T.Object(
  {
    projectId: UuidSchema,
    workflowType: T.String({ minLength: 1 }),
    retrievedWorkflows: T.Integer({ minimum: 0 }),
    workflows: T.Array(WorkflowSummarySchema),
    nextPageToken: NullableStringSchema,
  },
  { additionalProperties: false },
)

export const JsonValueSchema = T.Recursive((Self) =>
  T.Union([
    T.Null(),
    T.Boolean(),
    T.Number(),
    T.String(),
    T.Array(Self),
    T.Record(T.String(), Self),
  ]),
)

export type JsonValue = Static<typeof JsonValueSchema>

export const WorkflowResponseSchema = T.Object(
  {
    workflowId: T.String({ minLength: 1 }),
    runId: T.String({ minLength: 1 }),
    workflowType: T.String({ minLength: 1 }),
    workflowStartTime: NullableTimestampSchema,
    workflowCloseTime: NullableTimestampSchema,
    status: T.Union([TemporalStatusSchema, T.Null()]),
    result: JsonValueSchema,
  },
  { additionalProperties: false },
)

export const ExecutionTreeResponseSchema = T.Object(
  {
    type: T.Literal("workflow"),
    name: T.String({ minLength: 1 }),
    id: T.String({ minLength: 1 }),
    runId: T.String({ minLength: 1 }),
    status: T.Union([TemporalStatusSchema, T.Null()]),
    error: NullableStringSchema,
    children: T.Array(T.Object({
      type: T.Union([T.Literal("workflow"), T.Literal("activity")]),
      eventId: T.Integer({ minimum: 1 }),
      id: NullableStringSchema,
      name: NullableStringSchema,
      runId: NullableStringSchema,
      status: TemporalStatusSchema,
      error: NullableStringSchema,
      children: T.Union([T.Null(), T.Tuple([])]),
    }, { additionalProperties: false })),
    nextPageToken: NullableStringSchema,
    historyComplete: T.Boolean(),
    continuedAsNewRunId: NullableStringSchema,
  },
  { additionalProperties: false },
)

const WorkflowTypeLoadSchema = T.Object(
  {
    workflowType: T.Union([T.String({ minLength: 1 }), T.Null()]),
    runningCount: T.Integer({ minimum: 0 }),
    complexityWeight: T.Number({ minimum: 0 }),
    totalComplexity: T.Number({ minimum: 0 }),
  },
  { additionalProperties: false },
)
export const SystemLoadResponseSchema = T.Object(
  {
    loadPercentage: T.Number({ minimum: 0 }),
    runningWorkflows: T.Integer({ minimum: 0 }),
    currentComplexity: T.Number({ minimum: 0 }),
    maxComplexity: T.Number({ minimum: 0 }),
    breakdown: T.Array(WorkflowTypeLoadSchema),
  },
  { additionalProperties: false },
)

export const ErrorResponseSchema = T.Object(
  { detail: T.String({ minLength: 1 }) },
  { additionalProperties: false },
)

export function parseReadContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value)
}
