import { Type as T, type ObjectOptions, type Static } from "@sinclair/typebox";
import { ProjectDeletionWorkflowActorContext, type FileDiffSummary } from "@spark-temporal/contracts";

import { UuidSchema as Uuid } from "../schemas.ts";

const strict = { additionalProperties: false } satisfies ObjectOptions;

export const ProjectInitializationWorkflowInputSchema = T.Object(
  {
    projectId: Uuid,
    projectTypeId: Uuid,
    projectVersion: T.Optional(T.Integer({ minimum: 1, default: 1 })),
  },
  strict,
);

export const DeleteProjectWorkflowInputSchema = T.Object(
  {
    projectId: Uuid,
    projectVersion: T.Integer({ minimum: 1 }),
    workflowActor: T.Optional(T.Union([ProjectDeletionWorkflowActorContext, T.Null()])),
  },
  strict,
);

export const WorkflowSearchContextSchema = T.Object(
  {
    ProjectId: T.Optional(T.Array(Uuid)),
    ProjectVersion: T.Optional(T.Array(T.Number())),
  },
  { additionalProperties: true },
);

export type ProjectInitializationWorkflowInput = Static<
  typeof ProjectInitializationWorkflowInputSchema
>;
export type DeleteProjectWorkflowInput = Static<typeof DeleteProjectWorkflowInputSchema>;
export interface WorkflowResult {
  readonly status: "COMPLETED" | "CANCELED";
  readonly message?: string;
}

export const SERVICE_ORDER = [
  "projectLogicService",
  "documentManagementService",
  "formalCompletenessCheck",
  "plausibilityNotes",
  "examinationService",
  "administrativeFileDraft",
  "objectionsManagementService",
] as const;

export type ServiceName = (typeof SERVICE_ORDER)[number];
export type DmsApprovalStatus =
  | "APPROVED"
  | "APPROVING"
  | "FAILED_APPROVE"
  | "REJECTED"
  | "REQUIRES_APPROVAL";

export type NodeReference = {
  readonly nodeType: string;
  readonly id: string;
  readonly setOutdated?: boolean;
  readonly overrides?: {
    readonly filename?: string;
    readonly mvpStatus?: "unchecked" | "checked" | "needs_revision";
    readonly satzStatuses?: Readonly<Record<string, "unchecked" | "checked" | "needs_revision">>;
  };
};

const NodeParentSchema = T.Object(
  { nodeType: T.String({ minLength: 1 }), id: Uuid },
  { additionalProperties: true },
);
export const NodeSummarySchema = T.Object(
  {
    id: Uuid,
    nodeType: T.String({ minLength: 1 }),
    parents: T.Optional(T.Array(NodeParentSchema)),
    frontendParentIds: T.Optional(T.Array(T.String())),
  },
  { additionalProperties: true },
);
export const NodeListResponseSchema = T.Object(
  { nodes: T.Array(NodeSummarySchema) },
  { additionalProperties: true },
);
export type NodeSummaryPayload = Static<typeof NodeSummarySchema>;
export type NodeSummaryRow = NodeSummaryPayload & { readonly _service: string };

const TopicNormStatusSchema = T.Union([
  T.Literal("unchecked"),
  T.Literal("checked"),
  T.Literal("needs_revision"),
]);
export const TopicNormPayloadSchema = T.Object(
  {
    id: Uuid,
    mvpStatus: T.Optional(TopicNormStatusSchema),
    satzStatuses: T.Optional(T.Record(T.String(), TopicNormStatusSchema)),
  },
  { additionalProperties: true },
);
export const BatchNodesResponseSchema = T.Object(
  { results: T.Array(TopicNormPayloadSchema) },
  { additionalProperties: true },
);
export type TopicNormPayload = Static<typeof TopicNormPayloadSchema>;

export const TemplateTopicSchema = T.Object(
  {
    id: Uuid,
    projectId: Uuid,
    parentTopicId: T.Union([Uuid, T.Null()]),
    name: T.String(),
    description: T.Union([T.String(), T.Null()]),
    showInMvp: T.Boolean(),
    showInEwm: T.Boolean(),
    showInBeschluss: T.Boolean(),
    isDeleted: T.Boolean(),
    createdAt: T.String({ format: "date-time" }),
    updatedAt: T.String({ format: "date-time" }),
  },
  strict,
);
export type TemplateTopic = Static<typeof TemplateTopicSchema>;

export const CopyVersionResponseSchema = T.Object(
  { dryRun: T.Boolean(), copied: T.Integer({ minimum: 0 }) },
  { additionalProperties: true },
);
export const UndoVersionResponseSchema = T.Object(
  { deleted: T.Record(T.String({ minLength: 1 }), T.Integer({ minimum: 0 })) },
  { additionalProperties: true },
);
export const ApprovalStatusResponseSchema = T.Object(
  {
    approvalStatus: T.String({ minLength: 1 }),
    error: T.Optional(T.Union([T.String(), T.Null()])),
  },
  { additionalProperties: true },
);
export const CommitDiffResponseSchema = T.Object(
  {
    dryRun: T.Boolean(),
    new: T.Integer({ minimum: 0 }),
    changed: T.Integer({ minimum: 0 }),
    renamed: T.Integer({ minimum: 0 }),
    unchanged: T.Integer({ minimum: 0 }),
  },
  { additionalProperties: true },
);
export type CopyVersionResponse = Static<typeof CopyVersionResponseSchema>;
export type UndoVersionResponse = Static<typeof UndoVersionResponseSchema>;
export type ApprovalStatusResponse = Static<typeof ApprovalStatusResponseSchema>;
export type CommitDiffResponse = Static<typeof CommitDiffResponseSchema>;

export interface CopyPlan {
  readonly survivorsPerService: Readonly<Record<string, readonly NodeReference[]>>;
  readonly deletedFileIds: readonly string[];
  readonly deletedKeysCount: number;
}

export const emptyFileDiff = (): FileDiffSummary => ({ deleted: [], changed: [], renamed: [] });
