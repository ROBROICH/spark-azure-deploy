import { type Static, Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import fixture from "../../fixtures/read-scenarios.json";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const TimestampSchema = T.String({ pattern: "^20[0-9]{2}-[0-9]{2}-[0-9]{2}T" });
const NullableUuidSchema = T.Union([UuidSchema, T.Null()]);
const RequestStatusSchema = T.Union([
  T.Literal("RECEIVED"),
  T.Literal("IMPORTING"),
  T.Literal("IMPORTED"),
  T.Literal("FAILED"),
]);
const FileTypeSchema = T.Union([T.Literal("PLANUNTERLAGEN"), T.Literal("ERGAENZENDE_UNTERLAGEN")]);

const RequestRowSchema = T.Object(
  {
    requestId: UuidSchema,
    internalProjectId: T.String({ minLength: 1 }),
    name: T.String({ minLength: 1 }),
    xml: T.String({ minLength: 1 }),
    projectId: NullableUuidSchema,
    status: RequestStatusSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  },
  { additionalProperties: false },
);

const FileRowSchema = T.Object(
  {
    id: UuidSchema,
    requestId: UuidSchema,
    fileType: FileTypeSchema,
    fileUrl: T.String({ pattern: "^https://" }),
    fileName: T.Union([T.String({ minLength: 1 }), T.Null()]),
    downloaded: T.Boolean(),
    dmsFileId: NullableUuidSchema,
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  },
  { additionalProperties: false },
);

const RequestScenarioSchema = T.Object(
  {
    kind: T.Literal("request"),
    request: RequestRowSchema,
    files: T.Array(FileRowSchema),
  },
  { additionalProperties: false },
);

const ReadScenariosSchema = T.Object(
  {
    "received-empty": RequestScenarioSchema,
    "imported-one-file": RequestScenarioSchema,
    "imported-many-files": RequestScenarioSchema,
    "failed-one-file": RequestScenarioSchema,
    "absent-request": T.Object(
      { kind: T.Literal("absent"), requestId: UuidSchema },
      { additionalProperties: false },
    ),
    "cross-request-exclusion": T.Object(
      {
        kind: T.Literal("exclusion"),
        requestId: UuidSchema,
        excludedFileId: UuidSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export type ReadScenarios = Static<typeof ReadScenariosSchema>;
export const readScenarios: ReadScenarios = Value.Parse(ReadScenariosSchema, fixture);
