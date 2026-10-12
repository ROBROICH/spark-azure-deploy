import { Type } from "@sinclair/typebox";
import { createSelectSchema } from "drizzle-typebox";

import { plausibilityNotes } from "./db/schema.ts";

export const UuidSchema = Type.String({ format: "uuid" });
export const DateTimeSchema = Type.String({ format: "date-time" });
export const NullableIntegerSchema = Type.Union([Type.Integer(), Type.Null()]);
export const PlausibilityStatusSchema = Type.Union([
  Type.Literal("OPEN"),
  Type.Literal("RESOLVED"),
  Type.Literal("IGNORED"),
]);
export const UpdateTypeSchema = Type.Union([
  Type.Literal("automated"),
  Type.Literal("manual"),
  Type.Null(),
]);

const DbNote = createSelectSchema(plausibilityNotes);
export const NullableScoreSchema = Type.Union([
  Type.Number({ minimum: 0, maximum: 100 }),
  Type.Null(),
]);
export const NullableMergedCountSchema = Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]);

// Budgets gate result-file admission only; stored rows must stay readable through the response.
function contradictionSchemas(budget: { text?: number; name?: number; items?: number }) {
  const text = Type.String({ maxLength: budget.text });
  const nullableText = Type.Union([text, Type.Null()]);
  const nullableName = Type.Union([Type.String({ maxLength: budget.name }), Type.Null()]);
  const occurrence = Type.Object(
    {
      documentId: Type.String({ maxLength: budget.name }),
      documentName: nullableName,
      contentExcerpt: text,
      pageNumber: NullableIntegerSchema,
      // Per-location statement ("Merkmal: Wert [Bezugsrahmen]") written by the plausibility module.
      contradiction: Type.Optional(nullableText),
    },
    { additionalProperties: false },
  );
  const contradiction = Type.Object(
    {
      id: DbNote.properties.id,
      title: nullableName,
      description: text,
      rating: Type.Union([Type.Integer({ minimum: 0, maximum: 100 }), Type.Null()]),
      // Confidence layer of the plausibility module: mean of scoreA/scoreB (0-100, an
      // absolute value comparable across projects), the two raw scores, an audit trail
      // and the number of notes consolidated into the entry. Optional: older result files
      // and notes created before the module change carry none of them.
      confidenceScore: Type.Optional(NullableScoreSchema),
      scoreA: Type.Optional(NullableScoreSchema),
      scoreB: Type.Optional(NullableScoreSchema),
      evidence: Type.Optional(
        Type.Union([Type.Array(text, { maxItems: budget.items }), Type.Null()]),
      ),
      mergedCount: Type.Optional(NullableMergedCountSchema),
      status: PlausibilityStatusSchema,
      occurrences: Type.Array(occurrence, { maxItems: budget.items }),
    },
    { additionalProperties: false },
  );
  const result = Type.Object(
    { contradictions: Type.Array(contradiction, { maxItems: budget.items }) },
    { additionalProperties: false },
  );
  return { occurrence, contradiction, result };
}

const stored = contradictionSchemas({});
export const ContradictionOccurrenceSchema = stored.occurrence;
export const ContradictionSchema = stored.contradiction;
export const PlausibilityCheckResultSchema = stored.result;
export const PlausibilityResultFileSchema = contradictionSchemas({
  text: 50_000,
  name: 1_000,
  items: 1_000,
}).result;

export const JobDoneRequestSchema = Type.Object(
  { fileId: UuidSchema },
  { additionalProperties: false },
);

export const UpdateNoteRequestSchema = Type.Object(
  { status: PlausibilityStatusSchema },
  { additionalProperties: false },
);
export const JobDoneResponseSchema = Type.Object(
  {
    status: Type.String(),
    contradictionsFound: Type.Integer({ minimum: 0 }),
    totalOccurrences: Type.Integer({ minimum: 0 }),
    previousRecordsDeleted: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export const SuccessResponseSchema = Type.Object(
  { success: Type.Literal(true) },
  { additionalProperties: false },
);

export const ProjectParamsSchema = Type.Object(
  { projectId: UuidSchema },
  { additionalProperties: false },
);

export const NoteParamsSchema = Type.Object(
  { noteId: UuidSchema },
  { additionalProperties: false },
);

