import { type Static, type TSchema, Type as T } from "@sinclair/typebox";
import type { HttpJson } from "@spark-workflow/http-host";
import { Value } from "@sinclair/typebox/value";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const TimestampSchema = T.String({ minLength: 1 });
const NullableStringSchema = T.Union([T.String(), T.Null()]);
const NullableIntegerSchema = T.Union([T.Integer(), T.Null()]);
const StatusSchema = T.Union([T.Literal("OPEN"), T.Literal("RESOLVED"), T.Literal("IGNORED")]);
const UpdateTypeSchema = T.Union([T.Literal("automated"), T.Literal("manual"), T.Null()]);

const CommonNodeFields = {
  id: UuidSchema,
  projectVersion: T.Integer({ minimum: 1 }),
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
  isDeleted: T.Boolean(),
  frontendParentIds: T.Array(T.String()),
  updateType: UpdateTypeSchema,
  isOutdated: T.Boolean(),
};

export const PlausibilityNoteNodeSchema = T.Object(
  {
    nodeType: T.Literal("plausibility_note"),
    projectId: UuidSchema,
    title: NullableStringSchema,
    description: T.String(),
    rating: T.Union([T.Integer({ minimum: 0, maximum: 100 }), T.Null()]),
    // confidence layer of the plausibility module (nullable; absent on pre-change notes)
    confidenceScore: T.Union([T.Number(), T.Null()]),
    scoreA: T.Union([T.Number(), T.Null()]),
    scoreB: T.Union([T.Number(), T.Null()]),
    evidence: T.Union([T.Array(T.String()), T.Null()]),
    mergedCount: T.Union([T.Integer(), T.Null()]),
    status: StatusSchema,
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);

export const PlausibilityOccurrenceNodeSchema = T.Object(
  {
    nodeType: T.Literal("plausibility_note_occurrence"),
    projectId: T.Union([UuidSchema, T.Null()]),
    plausibilityNoteId: UuidSchema,
    documentId: T.String(),
    documentName: NullableStringSchema,
    contentExcerpt: T.String(),
    pageNumber: NullableIntegerSchema,
    contradiction: NullableStringSchema,
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);

export const ProcessNodeChangesResponseSchema = T.Object(
  {
    inserted: T.Array(T.Union([PlausibilityNoteNodeSchema, PlausibilityOccurrenceNodeSchema])),
    updated: T.Array(T.Union([PlausibilityNoteNodeSchema, PlausibilityOccurrenceNodeSchema])),
    deleted: T.Array(
      T.Object(
        {
          nodeType: T.Union([
            T.Literal("plausibility_note"),
            T.Literal("plausibility_note_occurrence"),
          ]),
          id: UuidSchema,
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const JobDoneResponseSchema = T.Object(
  {
    status: T.Union([T.Literal("contradictions_found"), T.Literal("no_contradictions")]),
    contradictionsFound: T.Integer({ minimum: 0 }),
    totalOccurrences: T.Integer({ minimum: 0 }),
    previousRecordsDeleted: T.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const SuccessResponseSchema = T.Object(
  { success: T.Literal(true) },
  { additionalProperties: false },
);

export const CopyVersionResponseSchema = T.Object(
  {
    dryRun: T.Boolean(),
    copied: T.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const UndoVersionResponseSchema = T.Object(
  {
    deleted: T.Object(
      {
        plausibility_note: T.Integer({ minimum: 0 }),
        plausibility_note_occurrence: T.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

export const DetailErrorSchema = T.Object(
  { detail: T.String({ minLength: 1 }) },
  { additionalProperties: false },
);

const ValidationIssueSchema = T.Object(
  {
    type: T.String({ minLength: 1 }),
    loc: T.Array(T.Union([T.String(), T.Integer()])),
    msg: T.String({ minLength: 1 }),
  },
  { additionalProperties: true },
);

export const ValidationErrorSchema = T.Object(
  { detail: T.Array(ValidationIssueSchema) },
  { additionalProperties: false },
);

export function parseMutationContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
