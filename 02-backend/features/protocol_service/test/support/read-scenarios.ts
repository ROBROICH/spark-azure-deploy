import { type Static, Type as T } from "@sinclair/typebox"
import { Value } from "@sinclair/typebox/value"

import rawScenarios from "../../fixtures/read-scenarios.json"

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
})
const TimestampSchema = T.String({
  pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\\.[0-9]+)?Z$",
})
const ServiceSchema = T.Union([
  T.Literal("project_logic"),
  T.Literal("formal_completeness"),
  T.Literal("comment"),
  T.Literal("supplementary"),
  T.Literal("plausibility"),
  T.Literal("document_management"),
  T.Literal("administrative_draft"),
  T.Literal("examination"),
  T.Literal("objections_management"),
])
const ScenariosSchema = T.Object(
  {
    projects: T.Object(
      {
        main: UuidSchema,
        empty: UuidSchema,
        other: UuidSchema,
        bulk: UuidSchema,
      },
      { additionalProperties: false },
    ),
    groups: T.Object(
      {
        workflowRunId: T.String({ minLength: 1 }),
        requestId: T.String({ minLength: 1 }),
        singleServiceWorkflowRunId: T.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    dates: T.Object(
      {
        inclusiveFrom: TimestampSchema,
        inclusiveTo: TimestampSchema,
      },
      { additionalProperties: false },
    ),
    expected: T.Object(
      {
        ungroupedTotal: T.Integer({ minimum: 1 }),
        collapsedItems: T.Integer({ minimum: 1 }),
        workflowItems: T.Integer({ minimum: 1 }),
        requestItems: T.Integer({ minimum: 1 }),
        userItems: T.Integer({ minimum: 1 }),
        agentItems: T.Integer({ minimum: 1 }),
        dateFilteredTotal: T.Integer({ minimum: 1 }),
        dateFilteredCollapsedItems: T.Integer({ minimum: 1 }),
        bulkBoundary: T.Literal(10000),
        bulkOverLimit: T.Literal(10001),
        requestTieOrder: T.Array(ServiceSchema, { minItems: 3, maxItems: 3 }),
        workflowTieOrder: T.Array(ServiceSchema, { minItems: 5, maxItems: 5 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
)

export type ReadScenarios = Static<typeof ScenariosSchema>
export const readScenarios: ReadScenarios = Value.Parse(ScenariosSchema, rawScenarios)
