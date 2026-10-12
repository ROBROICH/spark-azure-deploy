import { type Static, Type as T } from "@sinclair/typebox"
import { Value } from "@sinclair/typebox/value"

import rawScenarios from "../../fixtures/read-scenarios.json"

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
})
const ScenariosSchema = T.Object(
  {
    projects: T.Object(
      {
        empty: UuidSchema,
        mixed: UuidSchema,
        running: UuidSchema,
        completedCurrent: UuidSchema,
        completedHistorical: UuidSchema,
        failed: UuidSchema,
        canceled: UuidSchema,
        terminated: UuidSchema,
        timedOut: UuidSchema,
        continuedAsNew: UuidSchema,
        boundaryFailure: UuidSchema,
        missingFixture: UuidSchema,
        byTypeEmpty: UuidSchema,
        byTypeMultiple: UuidSchema,
        byTypeChildren: UuidSchema,
        byTypeBoundaryFailure: UuidSchema,
      },
      { additionalProperties: false },
    ),
    workflows: T.Object(
      {
        running: T.String({ minLength: 1 }),
        completed: T.String({ minLength: 1 }),
        failed: T.String({ minLength: 1 }),
        canceled: T.String({ minLength: 1 }),
        missing: T.String({ minLength: 1 }),
        rpcFailure: T.String({ minLength: 1 }),
        genericFailure: T.String({ minLength: 1 }),
        treeRoot: T.String({ minLength: 1 }),
        treeNested: T.String({ minLength: 1 }),
        treeMissing: T.String({ minLength: 1 }),
        treeBoundaryFailure: T.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    load: T.Object(
      {
        maxComplexity: T.Number({ exclusiveMinimum: 0 }),
        defaultWeight: T.Number({ minimum: 0 }),
        weights: T.Record(T.String({ minLength: 1 }), T.Number({ minimum: 0 })),
        expectedRunning: T.Integer({ minimum: 1 }),
        expectedComplexity: T.Number({ minimum: 0 }),
        expectedPercentage: T.Number({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
)

export type ReadScenarios = Static<typeof ScenariosSchema>
export const readScenarios: ReadScenarios = Value.Parse(ScenariosSchema, rawScenarios)
