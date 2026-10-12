import { toCompositeKey } from '@/db/nodes/compositeKey';
import {
  getChildNodes,
  type ProjectNodeIndex,
} from '@/db/nodes/examinationGraphModel';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useLiveNodes } from '@/db/nodes/hooks/useLiveNodes';
import type {
  NodePayloadByType,
  NodeRef,
  NodeRefByType,
  NodeSummary,
} from '@/db/nodes/types';
import type { FeedbackTargetRef } from './feedbackTarget';

export type FeedbackLookupEntry = {
  feedback: NodePayloadByType<'feedback'> | null;
  feedbackRef: NodeRefByType<'feedback'> | null;
};

const EMPTY_FEEDBACK_LOOKUP_ENTRY: FeedbackLookupEntry = {
  feedback: null,
  feedbackRef: null,
};

const dedupeNodeRefsByCompositeKey = <TNodeRef extends NodeRef>(
  nodeRefs: ReadonlyArray<TNodeRef>,
) => {
  return Array.from(
    new Map(
      nodeRefs.map((nodeRef) => [toCompositeKey(nodeRef), nodeRef]),
    ).values(),
  );
};

const isFeedbackDirectlyAttachedToTarget = (
  feedbackSummary: NodeSummary<'feedback'>,
  targetRef: FeedbackTargetRef,
) => {
  const targetKey = toCompositeKey(targetRef);

  return (
    (feedbackSummary.frontendParentIds ?? []).includes(targetKey) ||
    feedbackSummary.parents.some(
      (parent) =>
        parent.id === targetRef.id && parent.nodeType === targetRef.nodeType,
    )
  );
};

export const getFeedbackRefsForTarget = (
  index: ProjectNodeIndex,
  targetRef: FeedbackTargetRef,
): NodeRefByType<'feedback'>[] => {
  return getChildNodes(index, targetRef, 'feedback').filter((feedbackRef) =>
    isFeedbackDirectlyAttachedToTarget(feedbackRef, targetRef),
  );
};

const getFeedbackRefsByTargetKey = (
  index: ProjectNodeIndex,
  targetRefs: ReadonlyArray<FeedbackTargetRef>,
) => {
  return new Map(
    dedupeNodeRefsByCompositeKey(targetRefs).map((targetRef) => {
      const targetKey = toCompositeKey(targetRef);

      return [
        targetKey,
        getFeedbackRefsForTarget(index, targetRef).at(0) ?? null,
      ];
    }),
  );
};

export const useFeedbackLookup = (
  targetRefs: ReadonlyArray<FeedbackTargetRef>,
) => {
  const { index } = useGraph();
  const feedbackRefsByTargetKey = getFeedbackRefsByTargetKey(index, targetRefs);
  const feedbackRefs = dedupeNodeRefsByCompositeKey(
    Array.from(feedbackRefsByTargetKey.values()).filter(
      (feedbackRef): feedbackRef is NodeRefByType<'feedback'> =>
        Boolean(feedbackRef),
    ),
  );
  const { data: feedbackPayloads } = useLiveNodes(feedbackRefs);
  const feedbackByKey = new Map(
    feedbackPayloads.map((feedback) => [toCompositeKey(feedback), feedback]),
  );

  return {
    getFeedbackForTarget: (
      targetRef: FeedbackTargetRef,
    ): FeedbackLookupEntry => {
      const feedbackRef =
        feedbackRefsByTargetKey.get(toCompositeKey(targetRef)) ?? null;

      if (!feedbackRef) {
        return EMPTY_FEEDBACK_LOOKUP_ENTRY;
      }

      return {
        feedback: feedbackByKey.get(toCompositeKey(feedbackRef)) ?? null,
        feedbackRef,
      };
    },
  };
};
