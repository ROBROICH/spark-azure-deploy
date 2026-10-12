import { type Static, Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import fixture from "../../fixtures/read-scenarios.json";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const TimestampSchema = T.String({ pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}T" });
const SourceTypeSchema = T.Union([
  T.Literal("tableOfContents"),
  T.Literal("requiredDocuments"),
  T.Literal("contradiction"),
  T.Literal("materialLaw"),
  T.Literal("materialNorm"),
  T.Literal("materialSatz"),
  T.Literal("materialFundstelle"),
  T.Literal("manual"),
]);
const ProcessStepSchema = T.Union([
  T.Literal("formalCompletenessCheck"),
  T.Literal("plausibilityCheck"),
  T.Literal("materialCompletenessCheck"),
  T.Literal("legalReview"),
]);

const RequestRowSchema = T.Object(
  {
    id: UuidSchema,
    title: T.String({ minLength: 1, maxLength: 2000 }),
    reason: T.String({ maxLength: 2000 }),
    priority: T.Union([T.Literal("must"), T.Literal("should")]),
    processStep: T.Union([ProcessStepSchema, T.Null()]),
    sourceType: T.Union([SourceTypeSchema, T.Null()]),
    sourceItemId: T.Union([T.String({ minLength: 1, maxLength: 255 }), T.Null()]),
    includedInLetter: T.Boolean(),
    topicId: T.Union([UuidSchema, T.Null()]),
    documentId: T.Union([UuidSchema, T.Null()]),
    createdAt: TimestampSchema,
    updatedAt: TimestampSchema,
  },
  { additionalProperties: false },
);

const ProjectScenarioSchema = T.Object(
  { projectId: UuidSchema, requests: T.Array(RequestRowSchema) },
  { additionalProperties: false },
);

const ReadScenariosSchema = T.Object(
  {
    "empty-project-v1": ProjectScenarioSchema,
    "populated-project-v1": ProjectScenarioSchema,
    "other-project-v1": ProjectScenarioSchema,
  },
  { additionalProperties: false },
);

export type ReadScenarios = Static<typeof ReadScenariosSchema>;
export const readScenarios: ReadScenarios = Value.Parse(ReadScenariosSchema, fixture);
