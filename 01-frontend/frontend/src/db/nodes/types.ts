import type {
  BatchGetNodesResponse as DmsBatchResponse,
  NodeRef as DmsNodeRef,
} from '@/api-clients/dms-module';
import type {
  BatchGetNodesResponse as ExamBatchResponse,
  NodeRef as ExamNodeRef,
  ProcessNodeChangesRequest as ExamChangesRequest,
} from '@/api-clients/examination-module';
import type {
  BatchGetNodesResponse as FeedbackBatchResponse,
  NodeRef as FeedbackNodeRef,
  ProcessNodeChangesRequest as FeedbackChangesRequest,
} from '@/api-clients/feedback-module';
import type {
  BatchGetNodesResponse as PlsBatchResponse,
  NodeRef as PlsNodeRef,
  TopicNormStatus,
  ProcessNodeChangesRequest as PlsChangesRequest,
} from '@/api-clients/pls-module';
import type {
  BatchGetNodesResponse as OmsBatchResponse,
  NodeRef as OmsNodeRef,
  ProcessNodeChangesRequest as OmsChangesRequest,
} from '@/api-clients/oms-module';
import type {
  BatchGetNodesResponse as VaeBatchResponse,
  NodeRef as VaeNodeRef,
  ProcessNodeChangesRequest as VaeChangesRequest,
} from '@/api-clients/vae-module';
import type { CompositeKey } from './compositeKey';

export type {
  DmsNodeRef,
  ExamNodeRef,
  FeedbackNodeRef,
  OmsNodeRef,
  PlsNodeRef,
  TopicNormStatus,
  VaeNodeRef,
};

export type NodeTypeLiteral =
  | ExamNodeRef['node_type']
  | FeedbackNodeRef['node_type']
  | PlsNodeRef['node_type']
  | DmsNodeRef['node_type']
  | OmsNodeRef['node_type']
  | VaeNodeRef['node_type'];

export type NodeRefByType<T extends NodeTypeLiteral> = {
  id: string;
  node_type: T;
};

export type NodeRef = NodeRefByType<NodeTypeLiteral>;

export type NodeSummary<T extends NodeTypeLiteral = NodeTypeLiteral> =
  NodeRefByType<T> & {
    is_outdated?: boolean;
    parents: NodeRef[];
    frontend_parent_ids?: string[];
  };

export type SatzStatuses = Record<string, TopicNormStatus>;

type WithCompositeKey<T> = T & {
  compositeKey: CompositeKey;
};

export type ExamNodePayload = WithCompositeKey<
  ExamBatchResponse['results'][number]
>;

export type FeedbackNodePayload = WithCompositeKey<
  FeedbackBatchResponse['results'][number]
>;

export type PlsNodePayload = WithCompositeKey<
  PlsBatchResponse['results'][number]
>;

export type DmsNodePayload = WithCompositeKey<
  DmsBatchResponse['results'][number]
>;

export type OmsNodePayload = WithCompositeKey<
  OmsBatchResponse['results'][number]
>;

export type VaeNodePayload = WithCompositeKey<
  VaeBatchResponse['results'][number]
>;

type RawNodePayload =
  | ExamNodePayload
  | FeedbackNodePayload
  | PlsNodePayload
  | DmsNodePayload
  | OmsNodePayload
  | VaeNodePayload;

type VersionedTopicNormFields = {
  mvp_status: TopicNormStatus;
  satz_statuses: SatzStatuses;
};

type VersionedNodeFields = {
  is_outdated?: boolean;
  project_version?: number | null;
};

type WithVersioningFields<T> = T extends { node_type?: infer NodeType }
  ? NodeType extends 'topic_norm'
    ? Omit<T, keyof VersionedNodeFields | keyof VersionedTopicNormFields> &
        VersionedNodeFields &
        VersionedTopicNormFields
    : Omit<T, keyof VersionedNodeFields> & VersionedNodeFields
  : T;

export type NodePayload = WithVersioningFields<RawNodePayload>;

export type InsertNodeAction =
  | NonNullable<ExamChangesRequest['inserts']>[number]
  | NonNullable<FeedbackChangesRequest['inserts']>[number]
  | NonNullable<PlsChangesRequest['inserts']>[number]
  | NonNullable<OmsChangesRequest['inserts']>[number]
  | NonNullable<VaeChangesRequest['inserts']>[number];

export type UpdateNodeAction =
  | NonNullable<ExamChangesRequest['updates']>[number]
  | NonNullable<FeedbackChangesRequest['updates']>[number]
  | NonNullable<PlsChangesRequest['updates']>[number]
  | NonNullable<OmsChangesRequest['updates']>[number]
  | NonNullable<VaeChangesRequest['updates']>[number];

/** `NodePayloadByType<'gesetz'>` narrows to `{ node_type: 'gesetz' } & GesetzNodeResponse` */
export type NodePayloadByType<T extends NodeTypeLiteral = NodeTypeLiteral> =
  Extract<NodePayload, { node_type?: T }>;

export type InsertByType<T extends NodeTypeLiteral = NodeTypeLiteral> = Extract<
  InsertNodeAction,
  { node_type?: T }
>;

export type UpdateByType<T extends NodeTypeLiteral = NodeTypeLiteral> = Extract<
  UpdateNodeAction,
  { node_type?: T }
>;

export type OptimisticInsertedNodePayload = NodeRef & {
  compositeKey: CompositeKey;
  project_id: string;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
} & InsertNodeAction['payload'];

export type NodePayloadCollectionItem =
  | NodePayload
  | OptimisticInsertedNodePayload;
