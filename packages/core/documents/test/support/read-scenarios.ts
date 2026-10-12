import { type Static, Type as T } from "@sinclair/typebox"
import { Value } from "@sinclair/typebox/value"

import fixture from "../../fixtures/read-scenarios.json"

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
})
const VersionedProjectSchema = T.Object(
  { id: UuidSchema, latestVersion: T.Integer({ minimum: 1 }) },
  { additionalProperties: false },
)
const ReadScenariosSchema = T.Object(
  {
    projects: T.Object(
      {
        populated: VersionedProjectSchema,
        empty: VersionedProjectSchema,
        other: VersionedProjectSchema,
        locked: VersionedProjectSchema,
      },
      { additionalProperties: false },
    ),
    files: T.Object(
      {
        versioned: UuidSchema,
        deleted: UuidSchema,
        alpha: UuidSchema,
        beta: UuidSchema,
        otherProject: UuidSchema,
        missingObject: UuidSchema,
        pending: UuidSchema,
        unknown: UuidSchema,
      },
      { additionalProperties: false },
    ),
    topics: T.Object(
      {
        environment: UuidSchema,
        planning: UuidSchema,
        versionedLink: UuidSchema,
        alphaLink: UuidSchema,
        betaLink: UuidSchema,
      },
      { additionalProperties: false },
    ),
    zips: T.Object(
      {
        versioned: UuidSchema,
        emptyDiff: UuidSchema,
        failed: UuidSchema,
        rejected: UuidSchema,
        otherProject: UuidSchema,
        unknown: UuidSchema,
      },
      { additionalProperties: false },
    ),
    uploads: T.Object(
      {
        roundTripFilename: T.String({ minLength: 1 }),
        freshFilename: T.String({ minLength: 1 }),
        zipFilename: T.String({ minLength: 1 }),
        internalFilename: T.String({ minLength: 1 }),
        invalidFilename: T.String({ minLength: 1 }),
        roundTripBody: T.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    downloads: T.Object(
      {
        currentBody: T.String({ minLength: 1 }),
        historicalBody: T.String({ minLength: 1 }),
        deletedBody: T.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
)

export type ReadScenarios = Static<typeof ReadScenariosSchema>
export const readScenarios: ReadScenarios = Value.Parse(ReadScenariosSchema, fixture)
