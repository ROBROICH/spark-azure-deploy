import { type Static, type TSchema, Type as T } from "@sinclair/typebox";
import type { HttpJson } from "@spark-workflow/http-host";
import { Value } from "@sinclair/typebox/value";

import { BatchNodesResponseSchema, TemplateCategoriesSchema } from "./read-contracts.ts";

const UuidSchema = T.String({
  pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
});
const NullableUuidSchema = T.Union([UuidSchema, T.Null()]);
const DateTimeSchema = T.String({ minLength: 1 });

export const SuccessResponseSchema = T.Object(
  { success: T.Boolean() },
  { additionalProperties: false },
);
export const RequiredDocumentResponseSchema = T.Object(
  {
    documentTypeId: UuidSchema,
    documentName: T.String(),
    origin: T.Union([T.Literal("system"), T.Literal("custom")]),
    isResolved: T.Boolean(),
  },
  { additionalProperties: false },
);
export const DocumentAssignmentItemSchema = T.Object(
  {
    fileId: UuidSchema,
    aiSuggestedRequiredDocumentTypeId: NullableUuidSchema,
    humanRequiredDocumentTypeId: NullableUuidSchema,
    confidence: T.Union([T.Number(), T.Null()]),
  },
  { additionalProperties: false },
);
export const JobDoneResponseSchema = T.Object(
  {
    status: T.Union([T.Literal("results_processed"), T.Literal("no_results")]),
    matchedDocumentTypes: T.Integer({ minimum: 0 }),
    assignedDocuments: T.Integer({ minimum: 0 }),
    unassignedDocuments: T.Integer({ minimum: 0 }),
    previousRecordsDeleted: T.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export const TocNoteResponseSchema = T.Object(
  {
    id: UuidSchema,
    projectId: UuidSchema,
    content: T.String(),
    isResolved: T.Boolean(),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  },
  { additionalProperties: false },
);
export const TocNoteListResponseSchema = T.Array(TocNoteResponseSchema);
export const TocJobDoneResponseSchema = T.Object(
  {
    status: T.Union([T.Literal("success"), T.Literal("no_inhaltsverzeichnis_found")]),
    notesCreated: T.Integer({ minimum: 0 }),
    matchedDocumentTypesTotal: T.Integer({ minimum: 0 }),
    unmatchedDocumentTypes: T.Array(T.String()),
    tocDocumentId: NullableUuidSchema,
  },
  { additionalProperties: false },
);
export const TemplateCategoryMutationResponseSchema = TemplateCategoriesSchema;
export const TemplateSoftDeleteResponseSchema = T.Object(
  {
    deletedCategories: T.Integer({ minimum: 0 }),
    deletedDocumentTypes: T.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export const TemplateDocumentTypesResponseSchema = T.Array(
  T.Object(
    {
      category: T.String(),
      documentTypeId: UuidSchema,
      documentTypeName: T.String(),
      documentTypeDescription: T.String(),
      expectedCount: T.Union([T.Integer({ minimum: 0 }), T.Null()]),
    },
    { additionalProperties: false },
  ),
);

const NodeSchema = BatchNodesResponseSchema.properties.results.items;
const DeletedNodeSchema = T.Object(
  { nodeType: T.String({ minLength: 1 }), id: UuidSchema },
  { additionalProperties: false },
);
export const NodeMutationResponseSchema = T.Object(
  {
    inserted: T.Array(NodeSchema),
    updated: T.Array(NodeSchema),
    deleted: T.Array(DeletedNodeSchema),
  },
  { additionalProperties: false },
);
export const CopyVersionResponseSchema = T.Object(
  { dryRun: T.Boolean(), copied: T.Integer({ minimum: 0 }) },
  { additionalProperties: false },
);
export const UndoVersionResponseSchema = T.Object(
  { deleted: T.Record(T.String({ minLength: 1 }), T.Integer({ minimum: 0 })) },
  { additionalProperties: false },
);
export const DetailErrorSchema = T.Object(
  { detail: T.String({ minLength: 1 }) },
  { additionalProperties: false },
);
const ValidationIssueSchema = T.Object(
  {
    type: T.String(),
    loc: T.Array(T.Union([T.String(), T.Integer()])),
    msg: T.String(),
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
