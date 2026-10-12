import { type Static, Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import fixture from "../../fixtures/read-scenarios.json";

const ProjectSchema = T.Object(
  {
    id: T.String(),
    latestVersion: T.Integer({ minimum: 1 }),
    name: T.String(),
    internalProjectNumber: T.String(),
  },
  { additionalProperties: false },
);

const BoundaryProjectSchema = T.Object({ id: T.String() }, { additionalProperties: false });

const ReadScenariosSchema = T.Object(
  {
    projects: T.Object(
      {
        populated: ProjectSchema,
        empty: ProjectSchema,
        noExportableNodes: ProjectSchema,
        unknown: BoundaryProjectSchema,
      },
      { additionalProperties: false },
    ),
    projectTypes: T.Object(
      {
        populated: T.String(),
        empty: T.String(),
      },
      { additionalProperties: false },
    ),
    templates: T.Object(
      {
        active: T.String(),
        unknown: T.String(),
      },
      { additionalProperties: false },
    ),
    nodes: T.Object(
      {
        currentRoot: T.String(),
        currentChild: T.String(),
        historicalRoot: T.String(),
        historicalChild: T.String(),
        unknown: T.String(),
      },
      { additionalProperties: false },
    ),
    risks: T.Object(
      {
        currentHigh: T.String(),
        currentLow: T.String(),
        historical: T.String(),
        unknown: T.String(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ReadScenarios = Static<typeof ReadScenariosSchema>;
export const readScenarios: ReadScenarios = Value.Parse(ReadScenariosSchema, fixture);
