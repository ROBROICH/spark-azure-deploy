import { type Static, Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import fixture from "../../fixtures/read-scenarios.json";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const VersionedProjectSchema = T.Object(
  {
    id: UuidSchema,
    latestVersion: T.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
const HistoricalProjectSchema = T.Object(
  {
    id: UuidSchema,
    historicalVersion: T.Integer({ minimum: 1 }),
    latestVersion: T.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
const ReadScenariosSchema = T.Object(
  {
    projects: T.Object(
      {
        processed: HistoricalProjectSchema,
        nodes: HistoricalProjectSchema,
        empty: VersionedProjectSchema,
      },
      { additionalProperties: false },
    ),
    processedFiles: T.Object(
      {
        historical: T.Array(UuidSchema),
        current: T.Array(UuidSchema),
        excluded: T.Object(
          {
            incomplete: UuidSchema,
            failed: UuidSchema,
            deleted: UuidSchema,
          },
          { additionalProperties: false },
        ),
        duplicatedAcrossScopes: UuidSchema,
      },
      { additionalProperties: false },
    ),
    nodes: T.Object(
      {
        versionedBeteiligungsEingang: UuidSchema,
        versionedMarkdown: UuidSchema,
        versionedArgument: UuidSchema,
        currentOnlyArgument: UuidSchema,
        deletedArgument: UuidSchema,
        unknownArgument: UuidSchema,
        currentActiveIds: T.Array(UuidSchema),
        expectedMixedBatchOrder: T.Array(UuidSchema),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ReadScenarios = Static<typeof ReadScenariosSchema>;
export const readScenarios: ReadScenarios = Value.Parse(ReadScenariosSchema, fixture);
