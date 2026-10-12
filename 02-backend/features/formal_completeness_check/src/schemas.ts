import { type Static, Type } from "@sinclair/typebox";
import { t } from "elysia";

const MAX_TEXT_LENGTH = 50_000;
const MAX_NAME_LENGTH = 1_000;
const MAX_ITEMS = 1_000;

export const UuidSchema = Type.String({
  pattern: "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$",
});
export const NullableUuidSchema = Type.Union([UuidSchema, Type.Null()]);

export const ProjectParamsSchema = Type.Object(
  { projectId: UuidSchema },
  { additionalProperties: false },
);
export const RequiredProjectVersionQuerySchema = Type.Object(
  { projectVersion: t.Numeric({ minimum: 1 }) },
  { additionalProperties: false },
);

export const CreateRequiredDocumentTypeSchema = Type.Object(
  { documentName: Type.String({ minLength: 1, maxLength: MAX_NAME_LENGTH }) },
  { additionalProperties: false },
);
export const InitializeRequiredDocumentTypesSchema = Type.Object(
  { projectTypeId: UuidSchema },
  { additionalProperties: false },
);
export const PatchRequiredDocumentTypeSchema = Type.Object(
  {
    documentName: Type.Optional(
      Type.Union([Type.String({ minLength: 1, maxLength: MAX_NAME_LENGTH }), Type.Null()]),
    ),
    isResolved: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
  },
  { additionalProperties: false },
);
export const RequiredDocumentParamsSchema = Type.Object(
  { projectId: UuidSchema, documentTypeId: UuidSchema },
  { additionalProperties: false },
);

export const DocumentParamsSchema = Type.Object(
  { projectId: UuidSchema, fileId: UuidSchema },
  { additionalProperties: false },
);
export const PatchDocumentSchema = Type.Object(
  { humanRequiredDocumentTypeId: Type.Optional(NullableUuidSchema) },
  { additionalProperties: false },
);
export const JobDoneRequestSchema = Type.Object(
  { fileId: UuidSchema },
  { additionalProperties: false },
);
export const TocResultSchema = Type.Object(
  {
    inhaltsverzeichnisExtractionOutput: Type.Object(
      {
        status: Type.Union([Type.Literal("success"), Type.Literal("no_inhaltsverzeichnis_found")]),
        metadata: Type.Optional(
          Type.Union([
            Type.Object(
              { documentId: Type.Optional(Type.String({ maxLength: MAX_NAME_LENGTH })) },
              { additionalProperties: true },
            ),
            Type.Null(),
          ]),
        ),
      },
      { additionalProperties: true },
    ),
    inhaltsverzeichnisMatchingOutput: Type.Object(
      {
        matchedDocumentTypes: Type.Array(
          Type.Object(
            {
              requiredDocumentType: Type.Object(
                { documentTypeName: Type.String({ maxLength: MAX_NAME_LENGTH }) },
                { additionalProperties: true },
              ),
              assignedDocuments: Type.Array(Type.Unknown(), { maxItems: MAX_ITEMS }),
            },
            { additionalProperties: true },
          ),
          { maxItems: MAX_ITEMS },
        ),
      },
      { additionalProperties: true },
    ),
  },
  { additionalProperties: true },
);
export const CreateTocNotesSchema = Type.Array(
  Type.Object(
    { content: Type.String({ maxLength: MAX_TEXT_LENGTH }) },
    { additionalProperties: false },
  ),
  { maxItems: MAX_ITEMS },
);
export const TocNoteParamsSchema = Type.Object(
  { projectId: UuidSchema, noteId: UuidSchema },
  { additionalProperties: false },
);
export const UpdateTocNoteSchema = Type.Object(
  { isResolved: Type.Boolean() },
  { additionalProperties: false },
);

export const TemplateDocumentTypeInputSchema = Type.Object(
  {
    name: Type.String({ minLength: 1, maxLength: 255 }),
    description: Type.String({ minLength: 1, maxLength: 2_000 }),
    expectedCount: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
  },
  { additionalProperties: false },
);
export const TemplateCategoryInputSchema = Type.Object(
  {
    category: Type.String({ minLength: 1, maxLength: 255 }),
    documentTypes: Type.Array(TemplateDocumentTypeInputSchema, { maxItems: 100 }),
  },
  { additionalProperties: false },
);
export const CreateTemplateCategoriesSchema = Type.Array(TemplateCategoryInputSchema, {
  maxItems: 50,
});

export type CreateTemplateCategory = Static<typeof TemplateCategoryInputSchema>;

export const SuccessResponseSchema = Type.Object(
  { success: Type.Literal(true) },
  { additionalProperties: false },
);
export const RequiredDocumentResponseSchema = Type.Object(
  {
    documentTypeId: UuidSchema,
    documentName: Type.String(),
    origin: Type.Union([Type.Literal("system"), Type.Literal("custom")]),
    isResolved: Type.Boolean(),
  },
  { additionalProperties: false },
);
export const CategoryRequiredDocumentsResponseSchema = Type.Object(
  {
    categoryId: UuidSchema,
    categoryName: Type.String(),
    requiredDocuments: Type.Array(RequiredDocumentResponseSchema),
  },
  { additionalProperties: false },
);
export const RequiredDocumentTypesResponseSchema = Type.Object(
  { categories: Type.Array(CategoryRequiredDocumentsResponseSchema) },
  { additionalProperties: false },
);
export const TemplateDocumentTypeResponseSchema = Type.Object(
  {
    category: Type.String(),
    documentTypeId: UuidSchema,
    documentTypeName: Type.String(),
    documentTypeDescription: Type.String(),
    expectedCount: Type.Union([Type.Integer(), Type.Null()]),
  },
  { additionalProperties: false },
);
export const DocumentAssignmentItemSchema = Type.Object(
  {
    fileId: UuidSchema,
    aiSuggestedRequiredDocumentTypeId: NullableUuidSchema,
    humanRequiredDocumentTypeId: NullableUuidSchema,
    confidence: Type.Union([Type.Number(), Type.Null()]),
  },
  { additionalProperties: false },
);
export const AssignedDocumentSchema = Type.Object(
  {
    documentId: Type.String(),
    documentName: Type.String(),
    reasoning: Type.String(),
    confidence: Type.Number(),
    aiSuggestedRequiredDocumentTypeId: Type.Optional(NullableUuidSchema),
    humanRequiredDocumentTypeId: Type.Optional(NullableUuidSchema),
    contentExtractionId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  },
  { additionalProperties: false },
);
export const FormalCompletenessResultsSchema = Type.Object(
  {
    matchedDocumentTypes: Type.Array(
      Type.Object(
        {
          requiredDocumentType: Type.Object(
            {
              category: Type.Union([Type.String(), Type.Null()]),
              documentTypeName: Type.String(),
              documentTypeDescription: Type.String(),
            },
            { additionalProperties: false },
          ),
          assignedDocuments: Type.Array(AssignedDocumentSchema),
          confidence: Type.Number(),
        },
        { additionalProperties: false },
      ),
    ),
    unassignedDocuments: Type.Array(AssignedDocumentSchema),
  },
  { additionalProperties: false },
);
export const JobDoneResponseSchema = Type.Object(
  {
    status: Type.String(),
    matchedDocumentTypes: Type.Integer({ minimum: 0 }),
    assignedDocuments: Type.Integer({ minimum: 0 }),
    unassignedDocuments: Type.Integer({ minimum: 0 }),
    previousRecordsDeleted: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
export const TableContentNotesResponseSchema = Type.Object(
  {
    id: UuidSchema,
    projectId: UuidSchema,
    content: Type.String(),
    isResolved: Type.Boolean(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export const TocNotesWithStatusResponseSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("success"),
      Type.Literal("no_inhaltsverzeichnis_found"),
      Type.Null(),
    ]),
    notes: Type.Array(TableContentNotesResponseSchema),
  },
  { additionalProperties: false },
);
export const TocJobDoneResponseSchema = Type.Object(
  {
    status: Type.Union([Type.Literal("success"), Type.Literal("no_inhaltsverzeichnis_found")]),
    notesCreated: Type.Integer({ minimum: 0 }),
    matchedDocumentTypesTotal: Type.Integer({ minimum: 0 }),
    unmatchedDocumentTypes: Type.Array(Type.String()),
    tocDocumentId: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);
export const TemplateDocumentTypeItemResponseSchema = Type.Object(
  {
    id: UuidSchema,
    name: Type.String(),
    description: Type.String(),
    expectedCount: Type.Union([Type.Integer(), Type.Null()]),
  },
  { additionalProperties: false },
);
export const TemplateCategoryResponseSchema = Type.Object(
  {
    id: UuidSchema,
    name: Type.String(),
    projectTypeId: Type.Union([UuidSchema, Type.Null()]),
    templateDocumentTypes: Type.Array(TemplateDocumentTypeItemResponseSchema),
  },
  { additionalProperties: false },
);
export const TemplateSoftDeleteResponseSchema = Type.Object(
  {
    deletedCategories: Type.Integer({ minimum: 0 }),
    deletedDocumentTypes: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
