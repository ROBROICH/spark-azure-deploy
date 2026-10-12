import { Type, type Static } from "@sinclair/typebox";

import { DateTime, UUID, type WorkflowName } from "../registry.js";
import {
  PROJECT_VERSIONING_CREATE_WORKFLOW,
  PROJECT_VERSIONING_TASK_QUEUE,
} from "./project-versioning.js";

export const DOCUMENT_MANAGEMENT_TASK_QUEUE = "dms" as const;
export const DOCUMENT_MANAGEMENT_FILE_PROCESSING_WORKFLOW =
  "FileProcessingWorkflow" as WorkflowName<"FileProcessingWorkflow">;
export const DOCUMENT_MANAGEMENT_SINGLE_FILE_PROCESSING_WORKFLOW =
  "SingleFileProcessingWorkflow" as WorkflowName<"SingleFileProcessingWorkflow">;

export const DMSFileResponseSchema = Type.Object(
  {
    id: Type.String(),
    type: Type.String(),
    filename: Type.String(),
    bucketPath: Type.String(),
    projectId: Type.String(),
    mimeType: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    workflowId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    runId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    vectorSearchable: Type.Optional(Type.Union([Type.Boolean(), Type.Null()])),
    createdAt: Type.Optional(Type.Union([DateTime, Type.Null()])),
    updatedAt: Type.Optional(Type.Union([DateTime, Type.Null()])),
  },
  { $id: "DMSFileResponse" },
);

const contracts = Type.Module({
  DMSFileResponse: DMSFileResponseSchema,
  DmsWorkflowActorContext: Type.Object({
    actorUserId: Type.Union([UUID, Type.Null()]),
    triggeredByUserId: Type.Union([UUID, Type.Null()]),
    workflowType: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  }),
  DmsZipFileProcessingInput: Type.Object({
    fileId: UUID,
    filename: Type.String({ minLength: 1 }),
    projectId: UUID,
    fileType: Type.Union([Type.Literal("zip"), Type.Literal("ewms_zip")]),
    zipPath: Type.String({ minLength: 1 }),
    entryFileType: Type.Union([Type.Literal("document"), Type.Literal("ewms_document")]),
    sourceProjectVersion: Type.Integer({ minimum: 1 }),
    workflowActor: Type.Union([Type.Ref("DmsWorkflowActorContext"), Type.Null()]),
  }),
  DmsSingleFileProcessingInput: Type.Object({
    fileId: UUID,
    projectVersion: Type.Optional(Type.Integer({ minimum: 1 })),
    bucketPath: Type.String({ minLength: 1 }),
    filename: Type.String({ minLength: 1 }),
    fileType: Type.Union([
      Type.Literal("document"),
      Type.Literal("erwiderungs_import"),
      Type.Literal("template"),
    ]),
    projectId: Type.Union([UUID, Type.Null()]),
    workflowActor: Type.Union([Type.Ref("DmsWorkflowActorContext"), Type.Null()]),
  }),
  DmsZipFileProcessingCall: Type.Object({
    kind: Type.Literal("zip"),
    workflowName: Type.Literal(DOCUMENT_MANAGEMENT_FILE_PROCESSING_WORKFLOW),
    executionId: Type.String({ minLength: 1 }),
    taskQueue: Type.Literal(DOCUMENT_MANAGEMENT_TASK_QUEUE),
    projectId: UUID,
    projectVersion: Type.Integer({ minimum: 1 }),
    idReusePolicy: Type.Literal("REJECT_DUPLICATE"),
    idConflictPolicy: Type.Literal("USE_EXISTING"),
    workflowInput: Type.Ref("DmsZipFileProcessingInput"),
  }),
  DmsSingleFileProcessingCall: Type.Object({
    kind: Type.Literal("single_file"),
    workflowName: Type.Literal(DOCUMENT_MANAGEMENT_SINGLE_FILE_PROCESSING_WORKFLOW),
    executionId: Type.String({ minLength: 1 }),
    taskQueue: Type.Literal(DOCUMENT_MANAGEMENT_TASK_QUEUE),
    projectId: Type.Union([UUID, Type.Null()]),
    projectVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    idReusePolicy: Type.Literal("ALLOW_DUPLICATE_FAILED_ONLY"),
    idConflictPolicy: Type.Literal("USE_EXISTING"),
    workflowInput: Type.Ref("DmsSingleFileProcessingInput"),
  }),
  DocumentManagementFileProcessingTemporalInput: Type.Object({
    request: Type.Union(
      [Type.Ref("DmsZipFileProcessingCall"), Type.Ref("DmsSingleFileProcessingCall")],
      { discriminator: { propertyName: "kind" } },
    ),
  }),
  DocumentManagementFileProcessingTemporalResult: Type.Object({
    workflowId: Type.String({ minLength: 1 }),
    runId: Type.String({ minLength: 1 }),
    workflowStatus: Type.Union([
      Type.Literal("PENDING"),
      Type.Literal("RUNNING"),
      Type.Literal("COMPLETED"),
      Type.Literal("FAILED"),
      Type.Literal("CANCELED"),
      Type.Literal("TERMINATED"),
      Type.Literal("CONTINUED_AS_NEW"),
      Type.Literal("TIMED_OUT"),
      Type.Literal("REQUIRES_APPROVAL"),
    ]),
  }),
  DocumentManagementProjectVersionApprovalTemporalInput: Type.Object({
    workflowName: Type.Literal(PROJECT_VERSIONING_CREATE_WORKFLOW),
    executionId: Type.String({ minLength: 1 }),
    taskQueue: Type.Literal(PROJECT_VERSIONING_TASK_QUEUE),
    projectId: UUID,
    zipFileId: UUID,
    sourceProjectVersion: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    idReusePolicy: Type.Literal("ALLOW_DUPLICATE_FAILED_ONLY"),
    idConflictPolicy: Type.Literal("USE_EXISTING"),
  }),
  DocumentManagementProjectVersionApprovalTemporalResult: Type.Object({
    newVersion: Type.Union([Type.Integer(), Type.Null()]),
  }),
  DocumentManagementFileProcessingCancelTemporalInput: Type.Object({
    workflowId: Type.String({ minLength: 1 }),
    runId: Type.String({ minLength: 1 }),
  }),
  DocumentManagementFileProcessingCancelTemporalResult: Type.Object({
    workflowId: Type.String({ minLength: 1 }),
    cancelled: Type.Literal(true),
  }),
  DocumentManagementTemporalError: Type.Object({
    kind: Type.Union([Type.Literal("already_started"), Type.Literal("operation_failed")]),
    code: Type.String({ minLength: 1 }),
    message: Type.String({ minLength: 1 }),
  }),
});

export const DOCUMENT_MANAGEMENT_FILE_PROCESSING_OPERATION =
  "document-management.file-processing.start-and-describe" as const;
export const DOCUMENT_MANAGEMENT_PROJECT_VERSION_APPROVAL_OPERATION =
  "document-management.project-version-approval.start-and-result" as const;
export const DOCUMENT_MANAGEMENT_FILE_PROCESSING_CANCEL_OPERATION =
  "document-management.file-processing.cancel" as const;

export const DMSFileResponse = contracts.Import("DMSFileResponse");
export const DmsWorkflowActorContext = contracts.Import("DmsWorkflowActorContext");
export const DmsZipFileProcessingInput = contracts.Import("DmsZipFileProcessingInput");
export const DmsSingleFileProcessingInput = contracts.Import("DmsSingleFileProcessingInput");
export const DmsZipFileProcessingCall = contracts.Import("DmsZipFileProcessingCall");
export const DmsSingleFileProcessingCall = contracts.Import("DmsSingleFileProcessingCall");
export const DocumentManagementFileProcessingTemporalInput = contracts.Import(
  "DocumentManagementFileProcessingTemporalInput",
);
export const DocumentManagementFileProcessingTemporalResult = contracts.Import(
  "DocumentManagementFileProcessingTemporalResult",
);
export const DocumentManagementProjectVersionApprovalTemporalInput = contracts.Import(
  "DocumentManagementProjectVersionApprovalTemporalInput",
);
export const DocumentManagementProjectVersionApprovalTemporalResult = contracts.Import(
  "DocumentManagementProjectVersionApprovalTemporalResult",
);
export const DocumentManagementFileProcessingCancelTemporalInput = contracts.Import(
  "DocumentManagementFileProcessingCancelTemporalInput",
);
export const DocumentManagementFileProcessingCancelTemporalResult = contracts.Import(
  "DocumentManagementFileProcessingCancelTemporalResult",
);
export const DocumentManagementTemporalError = contracts.Import("DocumentManagementTemporalError");

export type DMSFileResponse = Static<typeof DMSFileResponse>;
export type DmsWorkflowActorContext = Static<typeof DmsWorkflowActorContext>;
export type DmsZipFileProcessingInput = Static<typeof DmsZipFileProcessingInput>;
export type DmsSingleFileProcessingInput = Static<typeof DmsSingleFileProcessingInput>;
export interface DmsFileProcessingOutput {
  successful: readonly {
    fileId: string | null;
    filename: string;
    action: string;
  }[];
  failed: readonly {
    filename: string;
    action: string;
    errorCode: string | null;
    errorMessage: string | null;
  }[];
  summary: {
    total: number;
    succeeded: number;
    failed: number;
  };
  status: "PENDING" | "APPROVED";
}
export type DmsFileProcessingWorkflow = (
  input: DmsZipFileProcessingInput,
) => Promise<DmsFileProcessingOutput>;
export type DmsSingleFileProcessingWorkflow = (
  input: DmsSingleFileProcessingInput,
) => Promise<void>;
export type DmsZipFileProcessingCall = Static<typeof DmsZipFileProcessingCall>;
export type DmsSingleFileProcessingCall = Static<typeof DmsSingleFileProcessingCall>;
export type DocumentManagementFileProcessingTemporalInput = Static<
  typeof DocumentManagementFileProcessingTemporalInput
>;
export type DocumentManagementFileProcessingTemporalResult = Static<
  typeof DocumentManagementFileProcessingTemporalResult
>;
export type DocumentManagementProjectVersionApprovalTemporalInput = Static<
  typeof DocumentManagementProjectVersionApprovalTemporalInput
>;
export type DocumentManagementProjectVersionApprovalTemporalResult = Static<
  typeof DocumentManagementProjectVersionApprovalTemporalResult
>;
export type DocumentManagementFileProcessingCancelTemporalInput = Static<
  typeof DocumentManagementFileProcessingCancelTemporalInput
>;
export type DocumentManagementFileProcessingCancelTemporalResult = Static<
  typeof DocumentManagementFileProcessingCancelTemporalResult
>;
export type DocumentManagementTemporalError = Static<typeof DocumentManagementTemporalError>;
