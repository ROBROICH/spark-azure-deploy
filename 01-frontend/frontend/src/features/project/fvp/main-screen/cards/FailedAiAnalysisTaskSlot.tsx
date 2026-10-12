import { ProcessingFailureBadge } from '@/features/project/processing-failure/ProcessingFailureBadge';
import type { WorkflowFailureCode } from '@/features/workflow-runtime/workflow-status/workflowStatus.types';
import { RunningResultCard } from './RunningResultCard';
import {
  RESULT_CARD_BY_TASK_ID,
  type AiAnalysisTaskConfig,
} from './aiAnalysisTasks';

type FailedAiAnalysisTaskSlotProps = {
  failureCode: WorkflowFailureCode;
  hasReadError: boolean;
  hasResult: boolean;
  iconStroke: string;
  projectId: string;
  task: AiAnalysisTaskConfig;
};

/**
 * Marks a failed task in its own card: a result from an earlier run stays
 * visible with the failure badge, otherwise the empty task card carries it.
 * When the result read failed, the result card shows that error and its retry
 * beside the badge.
 */
export const FailedAiAnalysisTaskSlot = (
  props: FailedAiAnalysisTaskSlotProps,
) => {
  const { failureCode, hasReadError, hasResult, iconStroke, projectId, task } =
    props;
  const failureBadge = (
    <ProcessingFailureBadge area={task.id} errorCode={failureCode} />
  );

  if (hasResult || hasReadError) {
    const ResultCard = RESULT_CARD_BY_TASK_ID[task.id];
    return <ResultCard projectId={projectId} statusAddon={failureBadge} />;
  }

  const Icon = task.icon;
  return (
    <RunningResultCard
      icon={<Icon aria-hidden="true" className="size-8" stroke={iconStroke} />}
      titleKey={task.titleKey}
      descriptionKey={task.descriptionKey}
      showProgress={false}
      statusAddon={failureBadge}
    />
  );
};
