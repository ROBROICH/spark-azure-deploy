import type { HttpJson } from "@spark-workflow/http-host"
import { type Static, type TSchema, Type as T } from "@sinclair/typebox"
import { Value } from "@sinclair/typebox/value"

const UUID_SOURCE = "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
export const UuidSchema = T.String({ pattern: UUID_SOURCE })
const NullableUuidSchema = T.Union([UuidSchema, T.Null()])
const NullableStringSchema = T.Union([T.String(), T.Null()])
const DateTimeSchema = T.String({ minLength: 1 })

const FileTypeSchema = T.Union([
  T.Literal("document"),
  T.Literal("zip"),
  T.Literal("ewms_zip"),
  T.Literal("ewms_document"),
  T.Literal("erwiderungs_import"),
  T.Literal("erwiderungs_export"),
  T.Literal("template"),
  T.Literal("law_data"),
  T.Literal("content_extraction"),
  T.Literal("temporal_checkpoint"),
  T.Literal("redacted_document"),
])

const WorkflowStatusSchema = T.Union([
  T.Literal("PENDING"),
  T.Literal("RUNNING"),
  T.Literal("COMPLETED"),
  T.Literal("FAILED"),
  T.Literal("CANCELED"),
  T.Literal("TERMINATED"),
  T.Literal("CONTINUED_AS_NEW"),
  T.Literal("TIMED_OUT"),
  T.Literal("REQUIRES_APPROVAL"),
])

export const ApprovalStatusSchema = T.Union([
  T.Literal("REQUIRES_APPROVAL"),
  T.Literal("APPROVING"),
  T.Literal("APPROVED"),
  T.Literal("FAILED_APPROVE"),
  T.Literal("REJECTED"),
  T.Null(),
])

const ZipWorkflowFailureCodeSchema = T.Union([
  T.Literal("ZIP_INVALID"),
  T.Literal("ZIP_AMBIGUOUS"),
  T.Literal("ZIP_ENCRYPTED"),
  T.Literal("ZIP_UNSUPPORTED_COMPRESSION"),
  T.Literal("ZIP_SPLIT"),
  T.Literal("ZIP_NOT_FOUND"),
  T.Literal("NO_PROCESSABLE_FILES"),
  T.Literal("UNSUPPORTED_FILETYPE"),
  T.Literal("INVALID_FILENAME"),
  T.Literal("VIRUS_DETECTED"),
  T.Literal("PROCESSING_FAILED"),
  T.Literal("PROCESSING_CANCELED"),
  T.Literal("PROCESSING_TIMED_OUT"),
  T.Null(),
])

export const ErrorResponseSchema = T.Object({ detail: T.Unknown() }, { additionalProperties: false })
export const parseValidationErrorDetail = (detail: string) => {
  const match = detail.match(
    /^(\d+) validation error:\n\s+\{'type': '([^']+)', 'loc': \((.*?)\), 'msg': (["'])(.*?)\4, 'input': (.*?), 'ctx':/s,
  )
  if (match === null) throw new Error("Expected a structured validation error")

  return {
    count: Number(match[1]),
    type: match[2]!,
    location: [...match[3]!.matchAll(/'([^']+)'|(\d+)/g)].map((entry) =>
      entry[1] === undefined ? Number(entry[2]) : entry[1]
    ),
    message: match[5]!,
    input: match[6]!.replace(/^'(.*)'$/, "$1"),
  }
}

export const FileResponseSchema = T.Object(
  {
    id: UuidSchema,
    type: FileTypeSchema,
    filename: T.String(),
    mimeType: T.String(),
    bucketPath: T.String(),
    version: T.Integer({ minimum: 1 }),
    projectVersion: T.Integer({ minimum: 1 }),
    addedInVersion: T.Union([T.Integer({ minimum: 1 }), T.Null()]),
    isDeleted: T.Boolean(),
    projectId: NullableUuidSchema,
    workflowId: NullableStringSchema,
    runId: NullableStringSchema,
    vectorSearchable: T.Union([T.Boolean(), T.Null()]),
    topics: T.Array(UuidSchema),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  },
  { additionalProperties: false },
)

export const FileListSchema = T.Array(FileResponseSchema)

export const ZipFileResponseSchema = T.Object(
  {
    id: UuidSchema,
    filename: T.String(),
    type: FileTypeSchema,
    bucketPath: T.String(),
    projectId: UuidSchema,
    workflowStatus: WorkflowStatusSchema,
    approvalStatus: ApprovalStatusSchema,
    approvalError: NullableStringSchema,
    workflowFailureCode: ZipWorkflowFailureCodeSchema,
    sourceProjectVersion: T.Union([T.Integer({ minimum: 1 }), T.Null()]),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  },
  { additionalProperties: false },
)

export const ZipFileListSchema = T.Array(ZipFileResponseSchema)

export const DownloadUrlSchema = T.Object(
  { downloadUrl: T.String({ pattern: "^https?://" }) },
  { additionalProperties: false },
)

export const UploadUrlSchema = T.Object(
  {
    uploadUrl: T.String({ pattern: "^https?://" }),
    mimeType: T.String({ minLength: 1 }),
  },
  { additionalProperties: false },
)

const NewFileSchema = T.Object(
  { filename: T.String(), bucketPath: T.String(), sha: T.String() },
  { additionalProperties: false },
)
const DeletedFileSchema = T.Object(
  { fileId: UuidSchema, filename: T.String(), sha: T.String() },
  { additionalProperties: false },
)
const ChangedFileSchema = T.Object(
  {
    fileId: UuidSchema,
    bucketPath: T.String(),
    filename: T.String(),
    sourceSha: T.String(),
    targetSha: T.String(),
  },
  { additionalProperties: false },
)
const RenamedFileSchema = T.Object(
  {
    fileId: UuidSchema,
    oldName: T.String(),
    newName: T.String(),
    sha: T.String(),
    bucketPath: T.Union([T.String(), T.Null()]),
  },
  { additionalProperties: false },
)
const UnchangedFileSchema = T.Object(
  { fileId: UuidSchema, filename: T.String(), sha: T.String() },
  { additionalProperties: false },
)

export const FileDiffSchema = T.Object(
  {
    new: T.Array(NewFileSchema),
    deleted: T.Array(DeletedFileSchema),
    changed: T.Array(ChangedFileSchema),
    renamed: T.Array(RenamedFileSchema),
    unchanged: T.Array(UnchangedFileSchema),
  },
  { additionalProperties: false },
)

const ParentReferenceSchema = T.Object(
  { id: UuidSchema, nodeType: T.String({ minLength: 1 }) },
  { additionalProperties: false },
)

export const NodeSummarySchema = T.Object(
  {
    id: UuidSchema,
    nodeType: T.Union([T.Literal("file"), T.Literal("file_topic"), T.Literal("zip_file")]),
    parents: T.Array(ParentReferenceSchema),
    frontendParentIds: T.Array(T.String()),
    isOutdated: T.Boolean(),
  },
  { additionalProperties: false },
)

export const NodeListSchema = T.Object(
  { nodes: T.Array(NodeSummarySchema) },
  { additionalProperties: false },
)
export type NodeList = Static<typeof NodeListSchema>

/**
 * The shared node-crud `/nodes` query UNION has no ORDER BY. Canonicalize only
 * that parsed top-level union by its semantic identity; nested array order is
 * part of each node payload and remains untouched.
 */
export function canonicalizeUnorderedNodeList(body: NodeList): NodeList {
  return {
    nodes: [...body.nodes].sort((left, right) => {
      if (left.nodeType !== right.nodeType) return left.nodeType < right.nodeType ? -1 : 1
      if (left.id === right.id) return 0
      return left.id < right.id ? -1 : 1
    }),
  }
}

const CommonNodeFields = {
  id: UuidSchema,
  projectId: NullableUuidSchema,
  isDeleted: T.Boolean(),
  isOutdated: T.Boolean(),
  frontendParentIds: T.Array(T.String()),
  projectVersion: T.Integer({ minimum: 1 }),
  updateType: T.Union([T.Literal("automated"), T.Literal("manual"), T.Null()]),
  createdAt: DateTimeSchema,
  updatedAt: DateTimeSchema,
}

const FileNodeSchema = T.Object(
  {
    nodeType: T.Literal("file"),
    type: FileTypeSchema,
    filename: T.String(),
    mimeType: T.String(),
    version: T.Integer({ minimum: 1 }),
    bucketPath: T.String(),
    addedInVersion: T.Union([T.Integer({ minimum: 1 }), T.Null()]),
    workflowId: NullableStringSchema,
    runId: NullableStringSchema,
    vectorSearchable: T.Union([T.Boolean(), T.Null()]),
    sourceZipFileId: NullableUuidSchema,
    workflowStatus: T.Union([WorkflowStatusSchema, T.Null()]),
    ...CommonNodeFields,
  },
  { additionalProperties: false },
)

const FileTopicNodeSchema = T.Object(
  {
    nodeType: T.Literal("file_topic"),
    fileId: UuidSchema,
    topicId: NullableUuidSchema,
    subtopicId: NullableUuidSchema,
    ...CommonNodeFields,
  },
  { additionalProperties: false },
)

const ZipFileNodeSchema = T.Object(
  {
    nodeType: T.Literal("zip_file"),
    filename: T.String(),
    bucketPath: T.String(),
    type: FileTypeSchema,
    workflowStatus: WorkflowStatusSchema,
    approvalStatus: ApprovalStatusSchema,
    approvalError: NullableStringSchema,
    workflowFailureCode: ZipWorkflowFailureCodeSchema,
    sourceProjectVersion: T.Union([T.Integer({ minimum: 1 }), T.Null()]),
    ...CommonNodeFields,
  },
  { additionalProperties: false },
)

export const BatchNodesResponseSchema = T.Object(
  { results: T.Array(T.Union([FileNodeSchema, FileTopicNodeSchema, ZipFileNodeSchema])) },
  { additionalProperties: false },
)

export function parseReadContract<Schema extends TSchema>(
  schema: Schema,
  value: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, value)
}
