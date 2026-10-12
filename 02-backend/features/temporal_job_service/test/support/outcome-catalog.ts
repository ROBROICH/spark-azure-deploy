import { type TSchema, Type as T } from "@sinclair/typebox"
import { Value } from "@sinclair/typebox/value"

import rawCatalog from "../../fixtures/temporal-outcomes.json"
import {
  ExecutionTreeResponseSchema,
  SystemLoadResponseSchema,
  WorkflowResponseSchema,
  WorkflowsByTypeResponseSchema,
  WorkflowsResponseSchema,
} from "./read-contracts"

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
})
const DeclaredErrorSchema = T.Object(
  {
    code: T.Union([
      T.Literal("NOT_FOUND"),
      T.Literal("RPC_ERROR"),
      T.Literal("APPLICATION_ERROR"),
    ]),
    message: T.String({ minLength: 1 }),
  },
  { additionalProperties: false },
)

function fixtureSchema<
  Operation extends string,
  Input extends TSchema,
  Result extends TSchema,
>(operation: Operation, input: Input, result: Result) {
  return T.Object(
    {
      name: T.String({ minLength: 1 }),
      operation: T.Literal(operation),
      input,
      outcome: T.Union([
        T.Object(
          { kind: T.Literal("return"), value: result },
          { additionalProperties: false },
        ),
        T.Object(
          { kind: T.Literal("throw"), error: DeclaredErrorSchema },
          { additionalProperties: false },
        ),
      ]),
    },
    { additionalProperties: false },
  )
}

const PaginationInput = {
  pageSize: T.Integer({ minimum: 1, maximum: 100 }),
  nextPageToken: T.Union([T.String({ minLength: 1 }), T.Null()]),
};

const ListInputSchema = T.Object(
  {
    executionStatus: T.Union([
      T.Literal("all"),
      T.Literal("Running"),
      T.Literal("Completed"),
      T.Literal("Failed"),
      T.Literal("Canceled"),
      T.Literal("Terminated"),
      T.Literal("TimedOut"),
      T.Literal("ContinuedAsNew"),
    ]),
    projectId: UuidSchema,
    projectVersion: T.Union([T.Integer({ minimum: 1 }), T.Null()]),
    workflowId: T.Optional(T.String({ minLength: 1, maxLength: 1000 })),
    ...PaginationInput,
  },
  { additionalProperties: false },
)
const ByTypeInputSchema = T.Object(
  {
    projectId: UuidSchema,
    workflowId: T.Optional(T.String({ minLength: 1, maxLength: 1000 })),
    workflowIds: T.Optional(T.Array(T.String({ minLength: 1, maxLength: 1000 }), { minItems: 1, maxItems: 100 })),
    rootWorkflowId: T.Optional(T.String({ minLength: 1, maxLength: 1000 })),
    rootRunId: T.Optional(UuidSchema),
    executionStatus: ListInputSchema.properties.executionStatus,
    workflowType: T.String({ minLength: 1, pattern: "^[A-Za-z0-9_.:-]+$" }),
    projectVersion: T.Union([T.Integer({ minimum: 1 }), T.Null()]),
    ...PaginationInput,
  },
  { additionalProperties: false },
)
const WorkflowInputSchema = T.Object(
  { workflowId: T.String({ minLength: 1 }), runId: T.Optional(T.String({ minLength: 1 })) },
  { additionalProperties: false },
)
const TreeInputSchema = T.Object(
  { ...WorkflowInputSchema.properties, ...PaginationInput },
  { additionalProperties: false },
)
const LoadInputSchema = T.Object(
  {
    maxComplexity: T.Number({ exclusiveMinimum: 0 }),
    workflowComplexity: T.Record(
      T.String({ minLength: 1 }),
      T.Number({ minimum: 0 }),
    ),
    defaultWorkflowComplexityWeight: T.Number({ minimum: 0 }),
  },
  { additionalProperties: false },
)

const CatalogSchema = T.Object(
  {
    fixtures: T.Array(
      T.Union([
        fixtureSchema("temporal-job.workflows.list", ListInputSchema, WorkflowsResponseSchema),
        fixtureSchema(
          "temporal-job.workflows.by-type",
          ByTypeInputSchema,
          WorkflowsByTypeResponseSchema,
        ),
        fixtureSchema(
          "temporal-job.workflow.project",
          WorkflowInputSchema,
          T.Object(
            { projectId: T.Union([UuidSchema, T.Null()]), runId: T.String({ minLength: 1 }) },
            { additionalProperties: false },
          ),
        ),
        fixtureSchema("temporal-job.workflow.get", WorkflowInputSchema, WorkflowResponseSchema),
        fixtureSchema(
          "temporal-job.workflow.execution-tree",
          TreeInputSchema,
          ExecutionTreeResponseSchema,
        ),
        fixtureSchema("temporal-job.load.get", LoadInputSchema, SystemLoadResponseSchema),
      ]),
      { minItems: 1 },
    ),
  },
  { additionalProperties: false },
)

export const outcomeCatalog = Value.Parse(CatalogSchema, rawCatalog)
