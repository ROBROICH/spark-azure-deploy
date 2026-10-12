import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useNodes } from '@/db/nodes/hooks/useNodes';
import type { NodePayloadByType } from '@/db/nodes/types';
import type { TopicNormEntry } from '../screen-data/useRechtsgrundlageData.helpers';

type NormRef = {
  id: string;
  nodeType: 'norm';
};

export const createNormRefByTopicNormId = (
  topicNorms: NodePayloadByType<'topic_norm'>[],
  index: ReturnType<typeof useGraph>['index'],
) => {
  const normRefByTopicNormId = new Map<string, NormRef>();

  for (const topicNorm of topicNorms) {
    const normId = (index.childrenByNodeId.get(topicNorm.id) ?? []).find(
      (childId) => index.nodeById.get(childId)?.nodeType === 'norm',
    );

    if (normId) {
      normRefByTopicNormId.set(topicNorm.id, {
        id: normId,
        nodeType: 'norm',
      });
    }
  }

  return normRefByTopicNormId;
};

const createResolvedTopicNormEntries = (params: {
  gesetze: NodePayloadByType<'gesetz'>[];
  normRefByTopicNormId: Map<string, NormRef>;
  norms: NodePayloadByType<'norm'>[];
  topicNorms: NodePayloadByType<'topic_norm'>[];
}) => {
  const normById = new Map(params.norms.map((norm) => [norm.id, norm]));
  const gesetzById = new Map(
    params.gesetze.map((gesetz) => [gesetz.id, gesetz]),
  );

  return params.topicNorms.map((topicNorm) => {
    const normRef = params.normRefByTopicNormId.get(topicNorm.id);
    const norm = normRef ? (normById.get(normRef.id) ?? null) : null;

    return {
      topicNorm,
      norm,
      gesetz: norm ? (gesetzById.get(norm.gesetzId) ?? null) : null,
    } satisfies TopicNormEntry;
  });
};

/**
 * Resolves the open Rechtsgrundlage group in two batched payload reads instead
 * of resolving `topic_norm -> norm -> gesetz` in every card.
 */
export const useResolvedTopicNormEntries = (
  topicNorms: NodePayloadByType<'topic_norm'>[],
) => {
  const { index } = useGraph();
  const normRefByTopicNormId = createNormRefByTopicNormId(topicNorms, index);
  const normRefs = Array.from(normRefByTopicNormId.values());
  const { data: norms } = useNodes(normRefs);
  const gesetzRefs = Array.from(
    new Map(
      norms.map((norm) => [
        norm.gesetzId,
        { id: norm.gesetzId, nodeType: 'gesetz' as const },
      ]),
    ).values(),
  );
  const { data: gesetze } = useNodes(gesetzRefs);

  return createResolvedTopicNormEntries({
    gesetze,
    normRefByTopicNormId,
    norms,
    topicNorms,
  });
};
