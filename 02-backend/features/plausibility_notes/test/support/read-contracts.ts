import { type Static, type TSchema, Type as T } from "@sinclair/typebox";
import type { HttpJson } from "@spark-workflow/http-host";
import { Value } from "@sinclair/typebox/value";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const NullableStringSchema = T.Union([T.String(), T.Null()]);
const NullableIntegerSchema = T.Union([T.Integer(), T.Null()]);
const TimestampSchema = T.String({ minLength: 1 });
const StatusSchema = T.Union([T.Literal("OPEN"), T.Literal("RESOLVED"), T.Literal("IGNORED")]);
const UpdateTypeSchema = T.Union([T.Literal("automated"), T.Literal("manual"), T.Null()]);

const ContradictionOccurrenceSchema = T.Object(
  {
    documentId: T.String(),
    documentName: NullableStringSchema,
    contentExcerpt: T.String(),
    pageNumber: NullableIntegerSchema,
    contradiction: T.Optional(NullableStringSchema),
  },
  { additionalProperties: false },
);
const ContradictionSchema = T.Object(
  {
    id: UuidSchema,
    title: NullableStringSchema,
    description: T.String(),
    rating: T.Union([T.Integer({ minimum: 0, maximum: 100 }), T.Null()]),
    confidenceScore: T.Optional(T.Union([T.Number(), T.Null()])),
    scoreA: T.Optional(T.Union([T.Number(), T.Null()])),
    scoreB: T.Optional(T.Union([T.Number(), T.Null()])),
    evidence: T.Optional(T.Union([T.Array(T.String()), T.Null()])),
    mergedCount: T.Optional(T.Union([T.Integer(), T.Null()])),
    status: StatusSchema,
    occurrences: T.Array(ContradictionOccurrenceSchema),
  },
  { additionalProperties: false },
);

export const PlausibilityNotesResponseSchema = T.Object(
  { contradictions: T.Array(ContradictionSchema) },
  { additionalProperties: false },
);

const NodeTypeSchema = T.Union([
  T.Literal("plausibility_note"),
  T.Literal("plausibility_note_occurrence"),
]);
const ParentReferenceSchema = T.Object(
  {
    id: T.String({ minLength: 1 }),
    nodeType: T.Union([T.Literal("plausibility_note"), T.Literal("file")]),
  },
  { additionalProperties: false },
);

export const NodeListSchema = T.Object(
  {
    nodes: T.Array(
      T.Object(
        {
          id: UuidSchema,
          nodeType: NodeTypeSchema,
          parents: T.Array(ParentReferenceSchema),
          frontendParentIds: T.Array(T.String()),
          isOutdated: T.Boolean(),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

const CommonNodeFields = {
  id: UuidSchema,
  isDeleted: T.Boolean(),
  isOutdated: T.Boolean(),
  frontendParentIds: T.Array(T.String()),
  projectVersion: T.Integer({ minimum: 1 }),
  updateType: UpdateTypeSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,
};
const PlausibilityNoteNodeSchema = T.Object(
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
const PlausibilityOccurrenceNodeSchema = T.Object(
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

export const BatchNodesResponseSchema = T.Object(
  {
    results: T.Array(T.Union([PlausibilityNoteNodeSchema, PlausibilityOccurrenceNodeSchema])),
  },
  { additionalProperties: false },
);

export const ErrorResponseSchema = T.Object(
  { detail: T.String({ minLength: 1 }) },
  { additionalProperties: false },
);

export type NodeType = Static<typeof NodeTypeSchema>;

export function parseReadContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
