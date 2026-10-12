import { type Static, Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import fixture from "../../fixtures/read-scenarios.json";

const IdSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const ProjectSchema = T.Object(
  { id: IdSchema, latestVersion: T.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);
const BoundaryProjectSchema = T.Object({ id: IdSchema }, { additionalProperties: false });
const IdRecord = <Keys extends readonly string[]>(keys: Keys) =>
  T.Object(
    Object.fromEntries(keys.map((key) => [key, IdSchema])) as {
      [Key in Keys[number]]: typeof IdSchema;
    },
    { additionalProperties: false },
  );

const ReadScenariosSchema = T.Object(
  {
    projects: T.Object(
      {
        populated: ProjectSchema,
        empty: ProjectSchema,
        tocWithoutTable: ProjectSchema,
        unknown: BoundaryProjectSchema,
      },
      { additionalProperties: false },
    ),
    projectTypes: IdRecord(["populated", "other", "empty"] as const),
    categories: IdRecord([
      "currentGeneral",
      "currentEnvironmental",
      "currentCustom",
      "currentDeleted",
      "historical",
    ] as const),
    documentTypes: IdRecord([
      "currentApplication",
      "currentEnvironmentalReport",
      "currentCustomAttachment",
      "currentDeleted",
      "historicalApplication",
    ] as const),
    documents: IdRecord([
      "currentAiOnly",
      "currentHumanOverride",
      "currentAiEnvironmental",
      "currentUnassigned",
      "currentHumanOnly",
      "historicalAssigned",
      "historicalUnassigned",
      "unknown",
    ] as const),
    files: IdRecord([
      "currentAiOnly",
      "currentHumanOverride",
      "currentAiEnvironmental",
      "currentUnassigned",
      "currentHumanOnly",
      "historicalAssigned",
      "historicalUnassigned",
    ] as const),
    toc: IdRecord([
      "newestResolved",
      "olderOpen",
      "deleted",
      "successStatus",
      "noTableStatus",
    ] as const),
    projectTemplateVersions: IdRecord(["historical", "current"] as const),
    templateCategories: IdRecord(["documents", "other", "deleted", "otherProjectType"] as const),
    templateDocumentTypes: IdRecord([
      "application",
      "plan",
      "optionalAttachment",
      "deletedNested",
      "insideDeletedCategory",
      "otherProjectType",
    ] as const),
  },
  { additionalProperties: false },
);

export type ReadScenarios = Static<typeof ReadScenariosSchema>;
export const readScenarios: ReadScenarios = Value.Parse(ReadScenariosSchema, fixture);
