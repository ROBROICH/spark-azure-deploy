import { Type, type Static } from "@sinclair/typebox";
import { Elysia, t } from "elysia";

import { FilenameSchema } from "./files/file-types.ts";
import { zipWorkflowFailureCodes } from "./temporal/zip-failure-codes.ts";

export const UuidSchema = Type.String({ format: "uuid" });
const NullableUuidSchema = Type.Union([UuidSchema, Type.Null()]);
const NullableStringSchema = Type.Union([Type.String(), Type.Null()]);
const NullableBooleanSchema = Type.Union([Type.Boolean(), Type.Null()]);
const DateTimeSchema = Type.String({ format: "date-time" });

export const FileTypeSchema = t.UnionEnum([
  "document",
  "zip",
  "ewms_zip",
  "ewms_document",
  "erwiderungs_import",
  "erwiderungs_export",
  "template",
  "law_data",
  "content_extraction",
  "temporal_checkpoint",
  "redacted_document",
]);
export const PublicFileTypeSchema = Type.Union([
  Type.Literal("document"),
  Type.Literal("zip"),
  Type.Literal("template"),
  Type.Literal("ewms_zip"),
  Type.Literal("erwiderungs_import"),
]);
export const ZipFileTypeSchema = Type.Union([Type.Literal("zip"), Type.Literal("ewms_zip")]);
const workflowStatuses = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELED",
  "TERMINATED",
  "CONTINUED_AS_NEW",
  "TIMED_OUT",
  "REQUIRES_APPROVAL",
] as const;
export const WorkflowStatusSchema = t.UnionEnum(workflowStatuses);
export const ZipApprovalStatusSchema = t.UnionEnum([
  "REQUIRES_APPROVAL",
  "APPROVING",
  "APPROVED",
  "FAILED_APPROVE",
  "REJECTED",
]);
export const ApprovalStatusSchema = t.Union([ZipApprovalStatusSchema, t.Null()]);
export const ZipWorkflowFailureCodeSchema = Type.Union(
  zipWorkflowFailureCodes.map((code) => Type.Literal(code)),
);
const NullableZipWorkflowFailureCodeSchema = Type.Union([
  ZipWorkflowFailureCodeSchema,
  Type.Null(),
]);

const baseUpload = {
  filename: FilenameSchema,
  createNewVersion: Type.Optional(Type.Boolean()),
};
const projectUpload = <const TypeName extends Static<typeof FileTypeSchema>>(type: TypeName) =>
  Type.Object(
    { type: Type.Literal(type), projectId: UuidSchema, ...baseUpload },
    { additionalProperties: false },
  );
const optionalProjectUpload = <const TypeName extends Static<typeof FileTypeSchema>>(
  type: TypeName,
) =>
  Type.Object(
    { type: Type.Literal(type), projectId: Type.Optional(UuidSchema), ...baseUpload },
    { additionalProperties: false },
  );

export const PublicUploadRequestSchema = Type.Union(
  [
    projectUpload("document"),
    projectUpload("zip"),
    optionalProjectUpload("template"),
    projectUpload("ewms_zip"),
    projectUpload("erwiderungs_import"),
  ],
  { discriminator: "type" },
);

export const UploadRequestSchema = Type.Union(
  [
    projectUpload("document"),
    projectUpload("zip"),
    optionalProjectUpload("template"),
    projectUpload("ewms_zip"),
    projectUpload("ewms_document"),
    projectUpload("erwiderungs_import"),
    projectUpload("erwiderungs_export"),
    projectUpload("content_extraction"),
    projectUpload("redacted_document"),
    optionalProjectUpload("law_data"),
    Type.Object(
      {
        type: Type.Literal("temporal_checkpoint"),
        projectId: Type.Optional(UuidSchema),
        workflowId: Type.String({ minLength: 1 }),
        runId: Type.String({ minLength: 1 }),
        ...baseUpload,
      },
      { additionalProperties: false },
    ),
  ],
  { discriminator: "type" },
);

export type UploadRequest = Static<typeof UploadRequestSchema>;

export const FileResponseSchema = Type.Object(
  {
    id: UuidSchema,
    type: FileTypeSchema,
    filename: Type.String(),
    mimeType: Type.String(),
    bucketPath: Type.String(),
    version: Type.Integer({ minimum: 1 }),
    projectVersion: Type.Integer({ minimum: 1 }),
    addedInVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    isDeleted: Type.Boolean(),
    projectId: NullableUuidSchema,
    workflowId: NullableStringSchema,
    runId: NullableStringSchema,
    vectorSearchable: Type.Union([Type.Boolean(), Type.Null()]),
    topics: Type.Array(UuidSchema),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  },
  { additionalProperties: false },
);
export type FileResponse = Static<typeof FileResponseSchema>;
export const FileListResponseSchema = Type.Array(FileResponseSchema);

export const ZipFileResponseSchema = Type.Object(
  {
    id: UuidSchema,
    filename: Type.String(),
    type: FileTypeSchema,
    bucketPath: Type.String(),
    projectId: UuidSchema,
    workflowStatus: WorkflowStatusSchema,
    approvalStatus: ApprovalStatusSchema,
    approvalError: NullableStringSchema,
    workflowFailureCode: NullableZipWorkflowFailureCodeSchema,
    sourceProjectVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    createdAt: DateTimeSchema,
    updatedAt: DateTimeSchema,
  },
  { additionalProperties: false },
);
export type ZipFileResponse = Static<typeof ZipFileResponseSchema>;
export const ZipFileListResponseSchema = Type.Array(ZipFileResponseSchema);

export const PublicConfirmResponseSchema = Type.Union([ZipFileResponseSchema, FileResponseSchema]);
export const UploadUrlResponseSchema = Type.Object({
  uploadUrl: Type.String({ format: "uri" }),
  mimeType: Type.String({ minLength: 1 }),
});
export const DownloadUrlResponseSchema = Type.Object({
  downloadUrl: Type.String({ format: "uri" }),
});
export const RequiredProjectVersionQuerySchema = Type.Object({
  projectVersion: t.Numeric({ minimum: 1 }),
});
export const OptionalProjectVersionQuerySchema = Type.Object({
  projectVersion: Type.Optional(t.Numeric({ minimum: 1 })),
});
export const FileDownloadQuerySchema = Type.Object({
  projectVersion: t.Numeric({ minimum: 1 }),
  inline: Type.Optional(t.BooleanString()),
  includeDeleted: Type.Optional(t.BooleanString()),
});
export const FileListQuerySchema = Type.Object({
  fileType: FileTypeSchema,
  projectVersion: t.Numeric({ minimum: 1 }),
  projectId: Type.Optional(UuidSchema),
  name: Type.Optional(Type.String()),
  path: Type.Optional(Type.String()),
  topicIds: Type.Optional(Type.Union([UuidSchema, Type.Array(UuidSchema)])),
  includeDeleted: Type.Optional(t.BooleanString()),
  page: Type.Optional(t.Numeric({ minimum: 1, maximum: 10_000 })),
  pageSize: Type.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
});
export const ZipListQuerySchema = Type.Object({
  projectVersion: t.Numeric({ minimum: 1 }),
  projectId: Type.Optional(UuidSchema),
  workflowStatus: Type.Optional(t.UnionEnum(workflowStatuses, { default: undefined })),
  fileType: Type.Optional(ZipFileTypeSchema),
  page: Type.Optional(t.Numeric({ minimum: 1, maximum: 10_000 })),
  pageSize: Type.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
});
export const FileParamsSchema = Type.Object({ fileId: UuidSchema });
export const ZipParamsSchema = Type.Object({ zipFileId: UuidSchema });

export const FileUpdateRequestSchema = Type.Object(
  {
    vectorSearchable: Type.Optional(NullableBooleanSchema),
    filename: Type.Optional(FilenameSchema),
    topics: Type.Optional(Type.Union([Type.Array(UuidSchema), Type.Null()])),
  },
  { additionalProperties: false },
);
export type FileUpdateRequest = Static<typeof FileUpdateRequestSchema>;

export const StartFileProcessingRequestSchema = Type.Object(
  { fileId: UuidSchema, projectId: UuidSchema },
  { additionalProperties: false },
);
export const StartFileProcessingResponseSchema = Type.Object(
  {
    workflowId: Type.String({ minLength: 1 }),
    runId: Type.String({ minLength: 1 }),
    workflowStatus: WorkflowStatusSchema,
  },
  { additionalProperties: false },
);

const NewFileDiffSchema = Type.Object(
  { filename: Type.String(), bucketPath: Type.String(), sha: Type.String() },
  { additionalProperties: false },
);
const DeletedFileDiffSchema = Type.Object(
  { fileId: UuidSchema, filename: Type.String(), sha: Type.String() },
  { additionalProperties: false },
);
const ChangedFileDiffSchema = Type.Object(
  {
    fileId: UuidSchema,
    bucketPath: Type.String(),
    filename: Type.String(),
    sourceSha: Type.String(),
    targetSha: Type.String(),
  },
  { additionalProperties: false },
);
const RenamedFileDiffSchema = Type.Object(
  {
    fileId: UuidSchema,
    oldName: Type.String(),
    newName: Type.String(),
    sha: Type.String(),
    bucketPath: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);
const UnchangedFileDiffSchema = Type.Object(
  { fileId: UuidSchema, filename: Type.String(), sha: Type.String() },
  { additionalProperties: false },
);

export const FileDiffSchema = Type.Object(
  {
    new: Type.Array(NewFileDiffSchema),
    excluded: Type.Optional(Type.Array(NewFileDiffSchema)),
    deleted: Type.Array(DeletedFileDiffSchema),
    changed: Type.Array(ChangedFileDiffSchema),
    renamed: Type.Array(RenamedFileDiffSchema),
    unchanged: Type.Array(UnchangedFileDiffSchema),
  },
  { additionalProperties: false },
);
export type FileDiff = Static<typeof FileDiffSchema>;

export const ApprovalDecisionQuerySchema = Type.Object(
  { decision: Type.Union([Type.Literal("approve"), Type.Literal("reject")]) },
  { additionalProperties: false },
);
export const ApprovalActionResponseSchema = Type.Object(
  {
    status: Type.Union([
      Type.Literal("success"),
      Type.Literal("already_processed"),
      Type.Literal("not_found"),
      Type.Literal("failed"),
    ]),
    message: Type.String({ minLength: 1 }),
    currentApprovalStatus: Type.Optional(
      Type.Union([
        Type.Literal("APPROVED"),
        Type.Literal("PENDING"),
        Type.Literal("REJECTED"),
        Type.Null(),
      ]),
    ),
    zipApprovalStatus: Type.Optional(ApprovalStatusSchema),
    newVersion: Type.Optional(Type.Union([Type.Integer(), Type.Null()])),
  },
  { additionalProperties: false },
);
export type ApprovalActionResponse = Static<typeof ApprovalActionResponseSchema>;

export const CancelResponseSchema = Type.Object(
  { fileId: UuidSchema, success: Type.Boolean() },
  { additionalProperties: false },
);

// Elysia shares this dynamic segment between internal file and project ZIP routes.
export const InternalFileParamsSchema = Type.Object({ id: UuidSchema });
export const InternalZipParamsSchema = Type.Object(
  { id: UuidSchema, zipFileId: UuidSchema },
  { additionalProperties: false },
);
export const InternalDiffQuerySchema = Type.Object({
  sourceVersion: t.Numeric({ minimum: 1 }),
});
export const ZipApprovalStatusRequestSchema = Type.Object(
  {
    approvalStatus: ZipApprovalStatusSchema,
    error: Type.Optional(NullableStringSchema),
  },
  { additionalProperties: false },
);
export const ZipApprovalStatusResponseSchema = Type.Object(
  {
    approvalStatus: ZipApprovalStatusSchema,
    error: NullableStringSchema,
  },
  { additionalProperties: false },
);
export const CommitDiffRequestSchema = Type.Object(
  {
    sourceVersion: Type.Integer({ minimum: 1 }),
    targetVersion: Type.Integer({ minimum: 1 }),
    lockToken: Type.String({ minLength: 1 }),
    dryRun: Type.Boolean(),
  },
  { additionalProperties: false },
);
export const CommitDiffResponseSchema = Type.Object(
  {
    dryRun: Type.Boolean(),
    new: Type.Integer({ minimum: 0 }),
    changed: Type.Integer({ minimum: 0 }),
    renamed: Type.Integer({ minimum: 0 }),
    unchanged: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const dmsEnumModels = new Elysia({ name: "document-management.models" }).model({
  FileTypeEnum: FileTypeSchema,
  WorkflowStatusEnum: WorkflowStatusSchema,
  ZipApprovalStatus: ZipApprovalStatusSchema,
});

const dmsResourceModels = dmsEnumModels.model({
  FileResponse: t.Object(
    { ...FileResponseSchema.properties, type: dmsEnumModels.Ref("FileTypeEnum") },
    { additionalProperties: false },
  ),
  ZipFileResponse: t.Object(
    {
      ...ZipFileResponseSchema.properties,
      type: dmsEnumModels.Ref("FileTypeEnum"),
      workflowStatus: dmsEnumModels.Ref("WorkflowStatusEnum"),
      approvalStatus: t.Nullable(dmsEnumModels.Ref("ZipApprovalStatus")),
    },
    { additionalProperties: false },
  ),
  StartFileProcessingResponse: t.Object(
    {
      ...StartFileProcessingResponseSchema.properties,
      workflowStatus: dmsEnumModels.Ref("WorkflowStatusEnum"),
    },
    { additionalProperties: false },
  ),
  ZipApprovalStatusResponse: t.Object(
    {
      ...ZipApprovalStatusResponseSchema.properties,
      approvalStatus: dmsEnumModels.Ref("ZipApprovalStatus"),
    },
    { additionalProperties: false },
  ),
});

export const dmsModels = dmsResourceModels.model({
  FileListResponse: t.Array(dmsResourceModels.Ref("FileResponse")),
  ZipFileListResponse: t.Array(dmsResourceModels.Ref("ZipFileResponse")),
  PublicConfirmResponse: t.Union([
    dmsResourceModels.Ref("FileResponse"),
    dmsResourceModels.Ref("ZipFileResponse"),
  ]),
});
