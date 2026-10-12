import {type Static, type TSchema, Type as T} from "@sinclair/typebox";
import type {HttpJson} from "@spark-workflow/http-host";
import {Value} from "@sinclair/typebox/value";

import {ApprovalStatusSchema, FileDiffSchema, FileResponseSchema, UuidSchema, ZipFileResponseSchema, } from "./read-contracts.ts";

export { FileDiffSchema, FileResponseSchema, ZipFileResponseSchema };

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
]);

export const StartFileProcessingResponseSchema = T.Object(
  {
    workflowId: T.String({ minLength: 1 }),
    runId: UuidSchema,
    workflowStatus: WorkflowStatusSchema,
  },
  { additionalProperties: false },
);

const CurrentApprovalStatusSchema = T.Union([
  T.Literal("APPROVED"),
  T.Literal("PENDING"),
  T.Literal("REJECTED"),
  T.Null(),
]);

const ZipApprovalStatusSchema = T.Union([
  T.Literal("REQUIRES_APPROVAL"),
  T.Literal("APPROVING"),
  T.Literal("APPROVED"),
  T.Literal("FAILED_APPROVE"),
  T.Literal("REJECTED"),
]);

export const ApprovalActionResponseSchema = T.Object(
  {
    status: T.Union([
      T.Literal("success"),
      T.Literal("already_processed"),
      T.Literal("not_found"),
      T.Literal("failed"),
    ]),
    message: T.String({ minLength: 1 }),
    currentApprovalStatus: T.Optional(CurrentApprovalStatusSchema),
    zipApprovalStatus: T.Optional(ApprovalStatusSchema),
    newVersion: T.Optional(T.Union([T.Integer(), T.Null()])),
  },
  { additionalProperties: false },
);

export const CancelResponseSchema = T.Object(
  { fileId: UuidSchema, success: T.Boolean() },
  { additionalProperties: false },
);

export const ZipApprovalStatusResponseSchema = T.Object(
  {
    approvalStatus: ZipApprovalStatusSchema,
    error: T.Union([T.String(), T.Null()]),
  },
  { additionalProperties: false },
);

export const CommitDiffResponseSchema = T.Object(
  {
    dryRun: T.Boolean(),
    new: T.Integer({ minimum: 0 }),
    changed: T.Integer({ minimum: 0 }),
    renamed: T.Integer({ minimum: 0 }),
    unchanged: T.Integer({ minimum: 0 }),
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

export function parseMutationContract<Schema extends TSchema>(
  schema: Schema,
  originalValue: HttpJson,
): Static<Schema> {
  return Value.Parse(schema, originalValue);
}
