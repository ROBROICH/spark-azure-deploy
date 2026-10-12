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

const ReadScenariosSchema = T.Object(
  {
    projects: T.Object(
      {
        populated: VersionedProjectSchema,
        versionTwo: VersionedProjectSchema,
        empty: VersionedProjectSchema,
        unknown: BoundaryProjectSchema,
      },
      { additionalProperties: false },
    ),
    nodes: T.Object(
      {
        currentPrimary: UuidSchema,
        currentSecondary: UuidSchema,
        versionTwo: UuidSchema,
        deleted: UuidSchema,
        unknown: UuidSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ReadScenarios = Static<typeof ReadScenariosSchema>;
export const readScenarios: ReadScenarios = Value.Parse(ReadScenariosSchema, fixture);
