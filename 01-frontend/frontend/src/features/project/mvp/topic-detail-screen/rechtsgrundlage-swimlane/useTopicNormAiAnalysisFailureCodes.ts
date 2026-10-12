import { useGraph } from '@/db/nodes/hooks/useGraph';
import { WORKFLOW_TYPE_SUZ_NORM } from '@/features/workflow-runtime/workflow-status/useRunningWorkflow';
import { useLatestWorkflowFailureByTarget } from '@/features/workflow-runtime/workflow-status/useLatestWorkflowFailureByTarget';
import type { TopicNormLawGroup } from '../screen-data/useRechtsgrundlageData.helpers';
import { createNormRefByTopicNormId } from '../screen-content/useResolvedTopicNormEntries';

/**
 * Reads the newest AI analysis of every norm in the topic at once, so a norm
 * card sends no workflow history request of its own.
 * @param lawGroups - The topic's law groups; closed groups count too, so opening one needs no new read.
 * @returns The failure code per norm id whose newest AI analysis failed.
 */
export const useTopicNormAiAnalysisFailureCodes = (
  lawGroups: ReadonlyArray<TopicNormLawGroup>,
) => {
  const { index } = useGraph();
  const normIds = Array.from(
    createNormRefByTopicNormId(
      lawGroups.flatMap((lawGroup) => lawGroup.topicNorms),
      index,
    ).values(),
    (normRef) => normRef.id,
  );

  return useLatestWorkflowFailureByTarget({
    targetIds: normIds,
    workflowType: WORKFLOW_TYPE_SUZ_NORM,
  }).failureCodeByTargetId;
};
