import type {
  V1DocumentManagementServiceBatchGetNodesResponse as DmsBatchResponse,
  V1DocumentManagementServiceNodeRef as DmsNodeRef,
  V1ExaminationServiceBatchGetNodesResponse as ExamBatchResponse,
  V1ExaminationServiceNodeRef as ExamNodeRef,
  V1ExaminationServiceProcessNodeChangesRequest as ExamChangesRequest,
  V1FeedbackBatchGetNodesResponse as FeedbackBatchResponse,
  V1FeedbackNodeRef as FeedbackNodeRef,
  V1FeedbackProcessNodeChangesRequest as FeedbackChangesRequest,
  V1ProjectLogicServiceBatchGetNodesResponse as PlsBatchResponse,
  V1ProjectLogicServiceNodeRef as PlsNodeRef,
  TopicNormStatus,
  V1ProjectLogicServiceProcessNodeChangesRequest as PlsChangesRequest,
  V1ObjectionsManagementServiceBatchGetNodesResponse as OmsBatchResponse,
  V1ObjectionsManagementServiceNodeRef as OmsNodeRef,
  V1ObjectionsManagementServiceProcessNodeChangesRequest as OmsChangesRequest,
  V1AdministrativeFileDraftBatchGetNodesResponse as VaeBatchResponse,
  V1AdministrativeFileDraftNodeRef as VaeNodeRef,
  V1AdministrativeFileDraftProcessNodeChangesRequest as VaeChangesRequest,
} from '@/api-clients/backend';
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
  | ExamNodeRef['nodeType']
  | FeedbackNodeRef['nodeType']
  | PlsNodeRef['nodeType']
  | DmsNodeRef['nodeType']
  | OmsNodeRef['nodeType']
  | VaeNodeRef['nodeType'];

export type NodeRefByType<T extends NodeTypeLiteral> = {
  id: string;
  nodeType: T;
};

export type NodeRef = NodeRefByType<NodeTypeLiteral>;

export type NodeSummary<T extends NodeTypeLiteral = NodeTypeLiteral> =
  NodeRefByType<T> & {
    isOutdated?: boolean;
    parents: NodeRef[];
    frontendParentIds?: string[];
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
  mvpStatus: TopicNormStatus;
  satzStatuses: SatzStatuses;
};

type VersionedNodeFields = {
  isOutdated?: boolean;
  projectVersion?: number | null;
};

type WithVersioningFields<T> = T extends { nodeType?: infer NodeType }
  ? NodeType extends 'topic_norm'
    ? Omit<T, keyof VersionedNodeFields | keyof VersionedTopicNormFields> &
        VersionedNodeFields &
        VersionedTopicNormFields
    : Omit<T, keyof VersionedNodeFields> & VersionedNodeFields
  : T;

export type NodePayload = WithVersioningFields<RawNodePayload>;

export type InsertNodeAction =
  | NonNullable<NonNullable<ExamChangesRequest['inserts']>[number]>
  | NonNullable<NonNullable<FeedbackChangesRequest['inserts']>[number]>
  | NonNullable<NonNullable<PlsChangesRequest['inserts']>[number]>
  | NonNullable<NonNullable<OmsChangesRequest['inserts']>[number]>
  | NonNullable<NonNullable<VaeChangesRequest['inserts']>[number]>;

export type UpdateNodeAction =
  | NonNullable<NonNullable<ExamChangesRequest['updates']>[number]>
  | NonNullable<NonNullable<FeedbackChangesRequest['updates']>[number]>
  | NonNullable<NonNullable<PlsChangesRequest['updates']>[number]>
  | NonNullable<NonNullable<OmsChangesRequest['updates']>[number]>
  | NonNullable<NonNullable<VaeChangesRequest['updates']>[number]>;

/** `NodePayloadByType<'gesetz'>` narrows to `{ nodeType: 'gesetz' } & GesetzNodeResponse` */
export type NodePayloadByType<T extends NodeTypeLiteral = NodeTypeLiteral> =
  Extract<NodePayload, { nodeType: T }>;

export type InsertByType<T extends NodeTypeLiteral = NodeTypeLiteral> = Extract<
  InsertNodeAction,
  { nodeType: T }
>;

export type UpdateByType<T extends NodeTypeLiteral = NodeTypeLiteral> = Extract<
  UpdateNodeAction,
  { nodeType: T }
>;

export type OptimisticInsertedNodePayload = NodeRef & {
  compositeKey: CompositeKey;
  projectId: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
} & InsertNodeAction['payload'];

export type NodePayloadCollectionItem =
  | NodePayload
  | OptimisticInsertedNodePayload;
