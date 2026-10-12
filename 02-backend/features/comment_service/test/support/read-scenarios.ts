import { type Static, Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import fixture from "../../fixtures/read-scenarios.json";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const ReadScenariosSchema = T.Object(
  {
    projects: T.Object(
      { populated: UuidSchema, empty: UuidSchema, other: UuidSchema },
      { additionalProperties: false },
    ),
    comments: T.Object(
      {
        ordered: T.Array(UuidSchema, { minItems: 1 }),
        otherProject: UuidSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ReadScenarios = Static<typeof ReadScenariosSchema>;
export const readScenarios: ReadScenarios = Value.Parse(ReadScenariosSchema, fixture);
