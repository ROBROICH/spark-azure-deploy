import {type Static, type TSchema, Type as T} from "@sinclair/typebox";
import type {HttpJson} from "@spark-workflow/http-host";
import {Value} from "@sinclair/typebox/value";

const UUID_SOURCE = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$";
export const UuidSchema = T.String({ pattern: UUID_SOURCE });
const NullableUuidSchema = T.Union([UuidSchema, T.Null()]);
const NullableStringSchema = T.Union([T.String(), T.Null()]);
const NullableNumberSchema = T.Union([T.Number(), T.Null()]);
const DateTimeSchema = T.String({ minLength: 1 });

export const ErrorResponseSchema = T.Object(
  { detail: T.Union([T.String(), T.Array(T.Unknown())]) },
  { additionalProperties: false },
);

const AssignmentFields = {
  documentId: UuidSchema,
  documentName: T.String(),
  reasoning: T.String(),
  confidence: T.Number(),
  aiSuggestedRequiredDocumentTypeId: NullableUuidSchema,
  humanRequiredDocumentTypeId: NullableUuidSchema,
  contentExtractionId: NullableUuidSchema,
};

const AssignedDocumentSchema = T.Object(AssignmentFields, { additionalProperties: false });
const UnassignedDocumentSchema = T.Object(AssignmentFields, { additionalProperties: false });
const DocumentTypeDefinitionSchema = T.Object(
  {
    category: NullableStringSchema,
    documentTypeName: T.String(),
    documentTypeDescription: T.String(),
  },
  { additionalProperties: false },
);

export const FormalCompletenessResultsSchema = T.Object(
  {
    matchedDocumentTypes: T.Array(
      T.Object(
        {
          requiredDocumentType: DocumentTypeDefinitionSchema,
          assignedDocuments: T.Array(AssignedDocumentSchema),
          confidence: T.Number(),
        },
        { additionalProperties: false },
      ),
    ),
    unassignedDocuments: T.Array(UnassignedDocumentSchema),
  },
  { additionalProperties: false },
);

export const RequiredDocumentTypesSchema = T.Object(
  {
    categories: T.Array(
      T.Object(
        {
          categoryId: UuidSchema,
          categoryName: T.String(),
          requiredDocuments: T.Array(
            T.Object(
              {
                documentTypeId: UuidSchema,
                documentName: T.String(),
                origin: T.Union([T.Literal("system"), T.Literal("custom")]),
                isResolved: T.Boolean(),
              },
              { additionalProperties: false },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const TocNotesSchema = T.Object(
  {
    status: T.Union([T.Literal("success"), T.Literal("no_inhaltsverzeichnis_found"), T.Null()]),
    notes: T.Array(
      T.Object(
        {
          id: UuidSchema,
          projectId: UuidSchema,
          content: T.String(),
          isResolved: T.Boolean(),
          createdAt: DateTimeSchema,
          updatedAt: DateTimeSchema,
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

const TemplateDocumentTypeSchema = T.Object(
  {
    id: UuidSchema,
    name: T.String(),
    description: T.String(),
    expectedCount: T.Union([T.Integer({ minimum: 0 }), T.Null()]),
  },
  { additionalProperties: false },
);

export const TemplateCategoriesSchema = T.Array(
  T.Object(
    {
      id: UuidSchema,
      name: T.String(),
      projectTypeId: NullableUuidSchema,
      templateDocumentTypes: T.Array(TemplateDocumentTypeSchema),
    },
    { additionalProperties: false },
  ),
);

const NodeTypes = [
  "category",
  "document_type",
  "document",
  "project_template_version",
  "table_of_content_notes",
  "toc_job_status",
] as const;
const NodeTypeSchema = T.Union(NodeTypes.map((nodeType) => T.Literal(nodeType)));
const ParentReferenceSchema = T.Object(
  { id: UuidSchema, nodeType: T.String() },
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
  projectId: UuidSchema,
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
  isDeleted: T.Boolean(),
  frontendParentIds: T.Array(T.String()),
  updateType: T.Union([T.Literal("automated"), T.Literal("manual"), T.Null()]),
  projectVersion: T.Integer({ minimum: 1 }),
  isOutdated: T.Boolean(),
};

const CategoryNodeSchema = T.Object(
  { nodeType: T.Literal("category"), name: T.String(), ...CommonNodeFields },
  { additionalProperties: false },
);
const DocumentTypeNodeSchema = T.Object(
  {
    nodeType: T.Literal("document_type"),
    name: T.String(),
    description: T.String(),
    confidence: NullableNumberSchema,
    categoryId: NullableUuidSchema,
    isResolved: T.Boolean(),
    origin: T.Union([T.Literal("system"), T.Literal("custom")]),
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);
const DocumentNodeSchema = T.Object(
  {
    nodeType: T.Literal("document"),
    fileId: NullableUuidSchema,
    aiSuggestedRequiredDocumentTypeId: NullableUuidSchema,
    documentName: T.String(),
    reasoning: NullableStringSchema,
    confidence: NullableNumberSchema,
    humanRequiredDocumentTypeId: NullableUuidSchema,
    contentExtractionId: NullableUuidSchema,
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);
const ProjectTemplateVersionNodeSchema = T.Object(
  {
    nodeType: T.Literal("project_template_version"),
    version: T.Integer({ minimum: 1 }),
    projectTypeId: NullableUuidSchema,
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);
const TocNoteNodeSchema = T.Object(
  {
    nodeType: T.Literal("table_of_content_notes"),
    content: T.String(),
    isResolved: T.Boolean(),
    ...CommonNodeFields,
  },
  { additionalProperties: false },
);
const TocStatusNodeSchema = T.Object(
  { nodeType: T.Literal("toc_job_status"), status: T.String(), ...CommonNodeFields },
  { additionalProperties: false },
);

export const BatchNodesResponseSchema = T.Object(
  {
    results: T.Array(
      T.Union([
        CategoryNodeSchema,
        DocumentTypeNodeSchema,
        DocumentNodeSchema,
        ProjectTemplateVersionNodeSchema,
        TocNoteNodeSchema,
        TocStatusNodeSchema,
      ]),
    ),
  },
  { additionalProperties: false },
);

export type NodeType = (typeof NodeTypes)[number];

export function parseReadContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value);
}
