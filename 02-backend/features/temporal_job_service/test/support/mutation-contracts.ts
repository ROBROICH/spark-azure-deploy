import type { TSchema, Static } from "@sinclair/typebox";
import { Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export const WorkflowStatusSchema = T.Union([
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
    status: WorkflowStatusSchema,
    timestamp: T.String({ minLength: 1 }),
    projectId: T.Optional(T.Union([T.String({ minLength: 1 }), T.Null()])),
    projectVersion: T.Optional(T.Union([T.Integer(), T.Null()])),
    failureMessage: T.Optional(T.Union([T.String({ maxLength: 500 }), T.Null()])),
    historyS3Key: T.Optional(T.Union([T.String({ minLength: 1 }), T.Null()])),
  },
  { additionalProperties: false },
);

export const ValidationErrorResponseSchema = T.Object(
  {
    detail: T.Array(
      T.Object(
        {
          type: T.String({ minLength: 1 }),
          loc: T.Array(T.Union([T.String(), T.Integer()]), { minItems: 1 }),
          msg: T.String({ minLength: 1 }),
        },
        { additionalProperties: true },
      ),
      { minItems: 1 },
    ),
  },
  { additionalProperties: false },
);

export const WorkflowExecutionSchema = T.Object(
  {
    id: T.String({ pattern: "^[0-9a-f-]{36}$" }),
    workflowId: T.String({ minLength: 1 }),
    runId: T.String({ minLength: 1 }),
    workflowType: T.String({ minLength: 1 }),
    projectId: T.Union([T.String({ pattern: "^[0-9a-f-]{36}$" }), T.Null()]),
    projectVersion: T.Union([T.Integer(), T.Null()]),
    status: WorkflowStatusSchema,
    startTime: T.Union([T.String({ minLength: 1 }), T.Null()]),
    endTime: T.Union([T.String({ minLength: 1 }), T.Null()]),
    failureMessage: T.Union([T.String(), T.Null()]),
    historyS3Key: T.Union([T.String({ minLength: 1 }), T.Null()]),
    createdAt: T.String({ minLength: 1 }),
    updatedAt: T.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const DatabaseRowsSchema = T.Object(
  { rows: T.Array(WorkflowExecutionSchema) },
  { additionalProperties: false },
);

export const DatabaseCleanupSchema = T.Object(
  {
    deleted: T.Integer({ minimum: 0 }),
    remaining: T.Literal(0),
  },
  { additionalProperties: false },
);

export function parseMutationContract<S extends TSchema>(
  schema: S,
  value: unknown | undefined,
): Static<S> {
  return Value.Parse(schema, value);
}
