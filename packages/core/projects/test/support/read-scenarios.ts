import { type Static, Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import fixture from "../../fixtures/read-scenarios.json";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const ProjectSchema = T.Object(
  { id: UuidSchema },
  { additionalProperties: false },
);
const PopulatedProjectSchema = T.Object(
  { id: UuidSchema, latestVersion: T.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);
const IdRecord = <Keys extends readonly string[]>(keys: Keys) =>
  T.Object(
    Object.fromEntries(keys.map((key) => [key, UuidSchema])) as {
      [Key in Keys[number]]: typeof UuidSchema;
    },
    { additionalProperties: false },
  );

const ReadScenariosSchema = T.Object(
  {
    projects: T.Object(
      {
        populated: PopulatedProjectSchema,
        unknown: ProjectSchema,
      },
      { additionalProperties: false },
    ),
    projectTypes: IdRecord(["primary", "unknown"] as const),
    projectStatuses: IdRecord(["current"] as const),
    topics: IdRecord(["withNorms", "withoutNorms", "batchSecond", "unknown"] as const),
    subtopics: IdRecord(["current"] as const),
    topicNorms: IdRecord(["current"] as const),
    deadlines: IdRecord(["unknown"] as const),
    releasedVersionLock: T.Object(
      {
        id: UuidSchema,
        sourceVersion: T.Integer({ minimum: 1 }),
        targetVersion: T.Integer({ minimum: 1 }),
        token: T.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ReadScenarios = Static<typeof ReadScenariosSchema>;
export const readScenarios: ReadScenarios = Value.Parse(ReadScenariosSchema, fixture);
