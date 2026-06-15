import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useDescendantNodes } from '@/db/nodes/hooks/useDescendantNodes';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useNodes } from '@/db/nodes/hooks/useNodes';
import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import { getRouteApi } from '@tanstack/react-router';
import { isTopicNormLinkedToTopicId } from '../../topicNormLinks';
import {
  createAvailableRechtsgrundlageData,
  createTopicNormData,
} from './useRechtsgrundlageData.helpers';
import { getStoredParentRefByType } from '../storedParentRefs';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

export const useLightweightRechtsgrundlageData = () => {
  const { topicName } = route.useParams();
  const topicRef = { id: topicName, node_type: 'topic' as const };
  const { data: topicNorms } = useDescendantNodes('topic_norm', topicRef);
  const activeTopicNorms = topicNorms.filter((topicNorm) =>
    isTopicNormLinkedToTopicId(topicNorm, topicName),
  );

  return createTopicNormData(activeTopicNorms);
};

type AvailableRechtsgrundlageNodeType = 'topic_norm' | 'gesetz' | 'norm';
type AvailableRechtsgrundlageNode =
  NodePayloadByType<AvailableRechtsgrundlageNodeType>;

const isAvailableRechtsgrundlageNodeType =
  <T extends AvailableRechtsgrundlageNodeType>(nodeType: T) =>
  (node: AvailableRechtsgrundlageNode): node is NodePayloadByType<T> =>
    node.node_type === nodeType;

const collectTopicNormRefsFromNormParents = (
  summaryTopicNormRefs: NodeRefByType<'topic_norm'>[],
  normen: NodePayloadByType<'norm'>[],
) => {
  const topicNormRefsById = new Map(
    summaryTopicNormRefs.map((topicNormRef) => [topicNormRef.id, topicNormRef]),
  );
  const topicNormRefsFromNormParents = normen.flatMap((norm) =>
    norm.frontend_parent_ids
      .map((parentId) => getStoredParentRefByType(parentId, 'topic_norm'))
      .filter((topicNormRef) => topicNormRef !== null),
  );

  for (const topicNormRef of topicNormRefsFromNormParents) {
    topicNormRefsById.set(topicNormRef.id, topicNormRef);
  }

  return Array.from(topicNormRefsById.values());
};

/**
 * Loads the full project-wide norm/law corpus needed only while the edit
 * dialog is open so the default right-panel render does not pay that cost.
 */
export const useAvailableRechtsgrundlageData = () => {
  const { topicName } = route.useParams();
  const { getNodesByType } = useGraph();
  const topicRef = { id: topicName, node_type: 'topic' as const };
  const summaryTopicNormRefs = useDescendants('topic_norm', topicRef);
  const corpusRefs: NodeRefByType<'gesetz' | 'norm'>[] = [
    ...getNodesByType('gesetz'),
    ...getNodesByType('norm'),
  ];
  const { data: corpusNodes } = useNodes(corpusRefs);
  const gesetze = corpusNodes.filter(
    isAvailableRechtsgrundlageNodeType('gesetz'),
  );
  const normen = corpusNodes.filter(isAvailableRechtsgrundlageNodeType('norm'));

  const topicNormRefs = collectTopicNormRefsFromNormParents(
    summaryTopicNormRefs,
    normen,
  );
  const { data: topicNormCandidates } = useNodes(topicNormRefs);
  const topicNorms = topicNormCandidates.filter((topicNorm) =>
    isTopicNormLinkedToTopicId(topicNorm, topicName),
  );

  return createAvailableRechtsgrundlageData(
    normen,
    gesetze,
    new Map(topicNorms.map((topicNorm) => [topicNorm.id, topicNorm])),
  );
};
