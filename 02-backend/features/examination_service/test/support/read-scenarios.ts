import { type Static, Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import fixture from "../../fixtures/read-scenarios.json";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const VersionedProjectSchema = T.Object(
  { id: UuidSchema, latestVersion: T.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);
const BoundaryProjectSchema = T.Object({ id: UuidSchema }, { additionalProperties: false });
const OutcomeSchema = T.Object(
  { status: T.Integer({ minimum: 100, maximum: 599 }), body: T.Unknown() },
  { additionalProperties: false },
);
const ReadScenariosSchema = T.Object(
  {
    projects: T.Object(
      {
        populated: VersionedProjectSchema,
        empty: VersionedProjectSchema,
        unknown: BoundaryProjectSchema,
        missingVersion: BoundaryProjectSchema,
        upstreamFailure: BoundaryProjectSchema,
      },
      { additionalProperties: false },
    ),
    nodes: T.Object(
      {
        law: UuidSchema,
        versionedNorm: UuidSchema,
        currentOnlyNorm: UuidSchema,
        deletedNorm: UuidSchema,
        unknownNorm: UuidSchema,
      },
      { additionalProperties: false },
    ),
    lawDatabaseBoundary: T.Object(
      {
        requests: T.Array(
          T.Object(
            {
              method: T.Literal("GET"),
              path: T.String({ pattern: "^/" }),
              query: T.String(),
              expectedCallsPerRun: T.Integer({ minimum: 1 }),
              outcome: OutcomeSchema,
            },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ReadScenarios = Static<typeof ReadScenariosSchema>;
export const readScenarios: ReadScenarios = Value.Parse(ReadScenariosSchema, fixture);
