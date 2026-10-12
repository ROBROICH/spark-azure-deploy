import {type Static, Type as T} from "@sinclair/typebox";
import { WorkflowFailureBranchSchema, WorkflowFailureCodeSchema } from "@spark-temporal/contracts";

export const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
export const TimestampSchema = T.String({
  pattern:
    "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?(?:Z|[+-][0-9]{2}:[0-9]{2})$",
});
export const NullableStringSchema = T.Union([T.String(), T.Null()]);
export const NullableUuidSchema = T.Union([UuidSchema, T.Null()]);
export const NullableTimestampSchema = T.Union([TimestampSchema, T.Null()]);

export const TemporalStatusSchema = T.Union([
  T.Literal("running"),
  T.Literal("completed"),
  T.Literal("failed"),
  T.Literal("canceled"),
  T.Literal("terminated"),
  T.Literal("timed_out"),
  T.Literal("continued_as_new"),
  T.Literal("pending"),
]);

export const PageTokenSchema = T.String({
  minLength: 1,
  pattern: "^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$",
});

const PaginationInput = {
  pageSize: T.Integer({ minimum: 1, maximum: 100 }),
  nextPageToken: T.Union([PageTokenSchema, T.Null()]),
};

/** The user-facing failure of a run; `null` for every run that did not fail. */
export const WorkflowFailureSchema = T.Object(
  {
    errorCode: WorkflowFailureCodeSchema,
    branches: T.Array(WorkflowFailureBranchSchema),
  },
  { additionalProperties: false },
);

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
);

export const WorkflowsResponseSchema = T.Object(
  {
    retrievedWorkflows: T.Integer({ minimum: 0 }),
    workflows: T.Array(WorkflowSummarySchema),
    nextPageToken: T.Union([PageTokenSchema, T.Null()]),
  },
  { additionalProperties: false },
);

export const ExecutionStatusSchema = T.Union([
  T.Literal("all"),
  T.Literal("Running"),
  T.Literal("Completed"),
  T.Literal("Failed"),
  T.Literal("Canceled"),
  T.Literal("Terminated"),
  T.Literal("TimedOut"),
  T.Literal("ContinuedAsNew"),
]);

export const WorkflowIdSchema = T.String({ minLength: 1, maxLength: 1000 });
export const WorkflowIdsOptions = { minItems: 1, maxItems: 100 };

export const WorkflowsListInputSchema = T.Object(
  {
    executionStatus: ExecutionStatusSchema,
    projectId: UuidSchema,
    projectVersion: T.Union([T.Integer({ minimum: 1 }), T.Null()]),
    workflowId: T.Optional(WorkflowIdSchema),
    ...PaginationInput,
  },
  { additionalProperties: false },
);

export const WorkflowsByTypeResponseSchema = T.Object(
  {
    projectId: UuidSchema,
    workflowType: T.String({ minLength: 1 }),
    retrievedWorkflows: T.Integer({ minimum: 0 }),
    workflows: T.Array(WorkflowSummarySchema),
    nextPageToken: T.Union([PageTokenSchema, T.Null()]),
  },
  { additionalProperties: false },
);

export const WorkflowsByTypeInputSchema = T.Object(
  {
    projectId: UuidSchema,
    workflowId: T.Optional(WorkflowIdSchema),
    workflowIds: T.Optional(T.Array(WorkflowIdSchema, WorkflowIdsOptions)),
    rootWorkflowId: T.Optional(WorkflowIdSchema),
    rootRunId: T.Optional(UuidSchema),
    executionStatus: ExecutionStatusSchema,
    workflowType: T.String({
      minLength: 1,
      pattern: "^[A-Za-z0-9_.:-]+$",
    }),
    projectVersion: T.Union([T.Integer({ minimum: 1 }), T.Null()]),
    ...PaginationInput,
  },
  { additionalProperties: false },
);

export const WorkflowResultSchema = T.Recursive(
  (Self) =>
    T.Union([
      T.Null(),
      T.Boolean(),
      T.Number(),
      T.String(),
      T.Array(Self),
      T.Record(T.String(), Self),
    ]),
  { $id: "TemporalJobWorkflowResult" },
);

export const WorkflowResponseSchema = T.Object(
  {
    workflowId: T.String({ minLength: 1 }),
    runId: T.String({ minLength: 1 }),
    workflowType: T.String({ minLength: 1 }),
    workflowStartTime: NullableTimestampSchema,
    workflowCloseTime: NullableTimestampSchema,
    status: T.Union([TemporalStatusSchema, T.Null()]),
    result: WorkflowResultSchema,
  },
  { additionalProperties: false },
);

export const WorkflowReadInputSchema = T.Object(
  {
    workflowId: T.String({ minLength: 1 }),
    runId: T.Optional(T.String({ minLength: 1 })),
    includeResult: T.Optional(T.Boolean()),
  },
  { additionalProperties: false },
);

export const ExecutionTreeInputSchema = T.Object(
  { ...WorkflowReadInputSchema.properties, ...PaginationInput },
  { additionalProperties: false },
);

export const ExecutionTreeNodeSchema = T.Object(
  {
    type: T.Union([T.Literal("workflow"), T.Literal("activity")]),
    eventId: T.Integer({ minimum: 1 }),
    id: NullableStringSchema,
    name: NullableStringSchema,
    runId: NullableStringSchema,
    status: TemporalStatusSchema,
    error: NullableStringSchema,
    children: T.Union([T.Null(), T.Tuple([])]),
  },
  { additionalProperties: false, $id: "TemporalJobExecutionTreeNode" },
);

export const ExecutionTreeResponseSchema = T.Object(
  {
    type: T.Literal("workflow"),
    name: T.String({ minLength: 1 }),
    id: T.String({ minLength: 1 }),
    runId: T.String({ minLength: 1 }),
    status: T.Union([TemporalStatusSchema, T.Null()]),
    error: NullableStringSchema,
    children: T.Array(ExecutionTreeNodeSchema),
    nextPageToken: T.Union([PageTokenSchema, T.Null()]),
    historyComplete: T.Boolean(),
    continuedAsNewRunId: NullableStringSchema,
  },
  { additionalProperties: false, $id: "TemporalJobExecutionTree" },
);

const WorkflowTypeLoadSchema = T.Object(
  {
    workflowType: T.Union([T.String({ minLength: 1 }), T.Null()]),
    runningCount: T.Integer({ minimum: 0 }),
    complexityWeight: T.Number({ minimum: 0 }),
    totalComplexity: T.Number({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const SystemLoadResponseSchema = T.Object(
  {
    loadPercentage: T.Number({ minimum: 0 }),
    runningWorkflows: T.Integer({ minimum: 0 }),
    currentComplexity: T.Number({ minimum: 0 }),
    maxComplexity: T.Number({ minimum: 0 }),
    breakdown: T.Array(WorkflowTypeLoadSchema),
  },
  { additionalProperties: false },
);

export const SystemLoadInputSchema = T.Object(
  {
    maxComplexity: T.Number({ exclusiveMinimum: 0 }),
    workflowComplexity: T.Record(T.String({ minLength: 1 }), T.Number({ minimum: 0 })),
    defaultWorkflowComplexityWeight: T.Number({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const WorkflowTrackingStatusSchema = T.Union([
  T.Literal("pending"),
  T.Literal("running"),
  T.Literal("failed"),
  T.Literal("completed"),
  T.Literal("terminated"),
  T.Literal("cancelled"),
  T.Literal("timed_out"),
]);

export const StatusRequestSchema = T.Object(
  {
    workflowId: T.String({ minLength: 1 }),
    runId: T.String({ minLength: 1 }),
    workflowType: T.String({ minLength: 1 }),
    status: WorkflowTrackingStatusSchema,
    timestamp: T.String({ format: "date-time" }),
    projectId: T.Optional(T.Union([UuidSchema, T.Null()])),
    projectVersion: T.Optional(T.Union([T.Integer(), T.Null()])),
    failureMessage: T.Optional(T.Union([T.String({ maxLength: 500 }), T.Null()])),
    failureCode: T.Optional(T.Union([WorkflowFailureCodeSchema, T.Null()])),
    failureBranches: T.Optional(T.Union([T.Array(WorkflowFailureBranchSchema), T.Null()])),
    historyS3Key: T.Optional(T.Union([T.String({ minLength: 1 }), T.Null()])),
  },
  { additionalProperties: false },
);

export const TemporalReadErrorSchema = T.Object(
  {
    code: T.Union([T.Literal("NOT_FOUND"), T.Literal("RPC_ERROR"), T.Literal("APPLICATION_ERROR")]),
    message: T.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export type WorkflowsListInput = Static<typeof WorkflowsListInputSchema>;
export type WorkflowsResponse = Static<typeof WorkflowsResponseSchema>;
export type WorkflowsByTypeInput = Static<typeof WorkflowsByTypeInputSchema>;
export type WorkflowsByTypeResponse = Static<typeof WorkflowsByTypeResponseSchema>;
export type WorkflowReadInput = Static<typeof WorkflowReadInputSchema>;
export type WorkflowResponse = Static<typeof WorkflowResponseSchema>;
export type ExecutionTreeInput = Static<typeof ExecutionTreeInputSchema>;
export type ExecutionTreeNode = Static<typeof ExecutionTreeNodeSchema>;
export type ExecutionTreeResponse = Static<typeof ExecutionTreeResponseSchema>;
export type SystemLoadInput = Static<typeof SystemLoadInputSchema>;
export type SystemLoadResponse = Static<typeof SystemLoadResponseSchema>;
export type StatusRequest = Static<typeof StatusRequestSchema>;
export type WorkflowTrackingStatus = Static<typeof WorkflowTrackingStatusSchema>;
export type TemporalStatus = Static<typeof TemporalStatusSchema>;
export type WorkflowFailure = Static<typeof WorkflowFailureSchema>;
