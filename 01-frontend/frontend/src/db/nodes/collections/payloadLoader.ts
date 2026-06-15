import {
  batchGetProjectIdBatchNodesPost as dmsBatchGet,
  type NodeRef as DmsNodeRef,
} from '@/api-clients/dms-module';
import {
  batchGetProjectIdBatchNodesPost as omsBatchGet,
  type NodeRef as OmsNodeRef,
} from '@/api-clients/oms-module';
import {
  batchGetProjectIdBatchNodesPost as feedbackBatchGet,
  type NodeRef as FeedbackNodeRef,
} from '@/api-clients/feedback-module';
import {
  batchGetProjectIdBatchNodesPost as vaeBatchGet,
  type NodeRef as VaeNodeRef,
} from '@/api-clients/vae-module';
import {
  batchGetProjectIdBatchNodesPost as examBatchGet,
  type NodeRef as ExamNodeRef,
} from '@/api-clients/examination-module';
import {
  batchGetProjectIdBatchNodesPost as plsBatchGet,
  type NodeRef as PlsNodeRef,
} from '@/api-clients/pls-module';
import DataLoader from 'dataloader';
import { toCompositeKey, type CompositeKey } from '../compositeKey';
import {
  DMS_NODE_TYPE_LITERALS,
  EXAMINATION_NODE_TYPE_LITERALS,
  FEEDBACK_NODE_TYPE_LITERALS,
  OMS_NODE_TYPE_LITERALS,
  PLS_NODE_TYPE_LITERALS,
  VAE_NODE_TYPE_LITERALS,
} from '../nodeTypeLabels';
import type { NodePayload, NodeRef } from '../types';

const PLS_NODE_TYPES = new Set<string>(PLS_NODE_TYPE_LITERALS);
const DMS_NODE_TYPES = new Set<string>(DMS_NODE_TYPE_LITERALS);
const EXAMINATION_NODE_TYPES = new Set<string>(EXAMINATION_NODE_TYPE_LITERALS);
const FEEDBACK_NODE_TYPES = new Set<string>(FEEDBACK_NODE_TYPE_LITERALS);
const OMS_NODE_TYPES = new Set<string>(OMS_NODE_TYPE_LITERALS);
const VAE_NODE_TYPES = new Set<string>(VAE_NODE_TYPE_LITERALS);

/**
 * Partitions node refs by backend so each batch request only receives the node
 * types it can resolve.
 *
 * @param nodeRefs Node refs queued for the current DataLoader batch.
 * @returns Backend-specific node ref arrays keyed by API owner.
 */
function groupNodeRefsByBackend(nodeRefs: ReadonlyArray<NodeRef>) {
  const exam: ExamNodeRef[] = [];
  const pls: PlsNodeRef[] = [];
  const dms: DmsNodeRef[] = [];
  const feedback: FeedbackNodeRef[] = [];
  const oms: OmsNodeRef[] = [];
  const vae: VaeNodeRef[] = [];

  for (const nodeRef of nodeRefs) {
    if (VAE_NODE_TYPES.has(nodeRef.node_type)) {
      vae.push(nodeRef as VaeNodeRef);
      continue;
    }
    if (PLS_NODE_TYPES.has(nodeRef.node_type as PlsNodeRef['node_type'])) {
      pls.push(nodeRef as PlsNodeRef);
      continue;
    }
    if (DMS_NODE_TYPES.has(nodeRef.node_type as DmsNodeRef['node_type'])) {
      dms.push(nodeRef as DmsNodeRef);
      continue;
    }
    if (
      FEEDBACK_NODE_TYPES.has(nodeRef.node_type as FeedbackNodeRef['node_type'])
    ) {
      feedback.push(nodeRef as FeedbackNodeRef);
      continue;
    }
    if (OMS_NODE_TYPES.has(nodeRef.node_type as OmsNodeRef['node_type'])) {
      oms.push(nodeRef as OmsNodeRef);
      continue;
    }
    if (
      EXAMINATION_NODE_TYPES.has(nodeRef.node_type as ExamNodeRef['node_type'])
    ) {
      exam.push(nodeRef as ExamNodeRef);
      continue;
    }
    throw new Error(`Unknown node_type: ${nodeRef.node_type}`);
  }

  return { exam, feedback, pls, dms, oms, vae };
}

/**
 * Fetches grouped node refs from their owning backends in one parallel batch.
 *
 * @param projectId Project that owns the requested nodes.
 * @param groupedRefs Node refs partitioned by backend API owner.
 * @returns Backend responses in the same fixed owner order used by the loader.
 */
async function fetchGroupedNodePayloads(
  projectId: string,
  projectVersion: number,
  groupedRefs: ReturnType<typeof groupNodeRefsByBackend>,
) {
  const { exam, feedback, pls, dms, oms, vae } = groupedRefs;
  const query = { project_version: projectVersion };

  return Promise.all([
    exam.length > 0
      ? examBatchGet({
          path: { project_id: projectId },
          query,
          body: { nodes: exam },
          throwOnError: true,
        })
      : null,
    feedback.length > 0
      ? feedbackBatchGet({
          path: { project_id: projectId },
          query,
          body: { nodes: feedback },
          throwOnError: true,
        })
      : null,
    pls.length > 0
      ? plsBatchGet({
          path: { project_id: projectId },
          query,
          body: { nodes: pls },
          throwOnError: true,
        })
      : null,
    dms.length > 0
      ? dmsBatchGet({
          path: { project_id: projectId },
          query,
          body: { nodes: dms },
          throwOnError: true,
        })
      : null,
    oms.length > 0
      ? omsBatchGet({
          path: { project_id: projectId },
          query,
          body: { nodes: oms },
          throwOnError: true,
        })
      : null,
    vae.length > 0
      ? vaeBatchGet({
          path: { project_id: projectId },
          query,
          body: { nodes: vae },
          throwOnError: true,
        })
      : null,
  ]);
}

function indexNodePayloadsByKey(
  responses: Awaited<ReturnType<typeof fetchGroupedNodePayloads>>,
) {
  const nodePayloadByKey = new Map<CompositeKey, NodePayload>();

  for (const res of responses) {
    if (!res) {
      continue;
    }

    for (const item of res.data.results) {
      const key = toCompositeKey(item);
      nodePayloadByKey.set(key, { ...item, compositeKey: key } as NodePayload);
    }
  }

  return nodePayloadByKey;
}

async function loadNodePayloadBatch(
  projectId: string,
  projectVersion: number,
  nodeRefs: ReadonlyArray<NodeRef>,
) {
  const groupedRefs = groupNodeRefsByBackend(nodeRefs);
  const responses = await fetchGroupedNodePayloads(
    projectId,
    projectVersion,
    groupedRefs,
  );
  const nodePayloadByKey = indexNodePayloadsByKey(responses);

  return nodeRefs.map((ref) => {
    const key = toCompositeKey(ref);
    return (
      nodePayloadByKey.get(key) ?? new Error(`Missing node payload for ${key}`)
    );
  });
}

/** Batches NodeRef requests and routes them to the correct backend based on node_type. */
export const createNodeDataLoader = (
  projectId: string,
  projectVersion: number,
) => {
  return new DataLoader<NodeRef, NodePayload, CompositeKey>(
    (nodeRefs) => loadNodePayloadBatch(projectId, projectVersion, nodeRefs),
    {
      cacheKeyFn: (nodeRef) => toCompositeKey(nodeRef),
    },
  );
};
