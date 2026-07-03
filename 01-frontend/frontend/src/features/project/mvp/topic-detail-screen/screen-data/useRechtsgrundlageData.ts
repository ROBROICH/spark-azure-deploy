import { getLegalBasisNormsLegalBasisNormsGetOptions } from '@/api-clients/examination-module/@tanstack/react-query.gen';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useDescendantNodes } from '@/db/nodes/hooks/useDescendantNodes';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useNodes } from '@/db/nodes/hooks/useNodes';
import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import { useProject } from '@/features/project/data/collections/projects.collection';
import { federalStateCodeByGermanState } from '@/features/project/data/project-details-form/federalStates';
import { useSuspenseQuery } from '@tanstack/react-query';
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

type AvailableRechtsgrundlageNodeType = 'topic_norm' | 'norm';
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
  const { topicName, verfahrenId } = route.useParams();
  const { data: project, isLoading: isProjectLoading } =
    useProject(verfahrenId);
  const { getNodesByType } = useGraph();
  const topicRef = { id: topicName, node_type: 'topic' as const };
  const summaryTopicNormRefs = useDescendants('topic_norm', topicRef);
  const corpusRefs: NodeRefByType<'norm'>[] = getNodesByType('norm');
  const { data: corpusNodes } = useNodes(corpusRefs);
  const normen = corpusNodes.filter(isAvailableRechtsgrundlageNodeType('norm'));
  const { data: legalBasisNorms } = useSuspenseQuery(
    getLegalBasisNormsLegalBasisNormsGetOptions(),
  );

  const topicNormRefs = collectTopicNormRefsFromNormParents(
    summaryTopicNormRefs,
    normen,
  );
  const { data: topicNormCandidates } = useNodes(topicNormRefs);
  const topicNorms = topicNormCandidates.filter((topicNorm) =>
    isTopicNormLinkedToTopicId(topicNorm, topicName),
  );
  const projectBundeslandCode = project?.state
    ? federalStateCodeByGermanState[project.state]
    : null;

  return {
    ...createAvailableRechtsgrundlageData(
      legalBasisNorms,
      normen,
      new Map(topicNorms.map((topicNorm) => [topicNorm.id, topicNorm])),
      projectBundeslandCode,
    ),
    isProjectLoading,
  };
};
