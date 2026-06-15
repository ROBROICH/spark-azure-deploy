import {
  useWorkflowProgress,
  type WorkflowProgress,
} from '@/features/workflow-runtime/workflow-status/useWorkflowProgress';
import { RunningResultCard } from './RunningResultCard';
import type { AiAnalysisTaskConfig, TaskProgress } from './aiAnalysisTasks';

const ICON_CLASS = 'size-8';

// FVP task estimates are 1-3h and the card only shows minute/hour-granular
// remaining time, so a per-second tick is wasteful. Refresh every 30s, which
// keeps the progress bar visibly advancing without per-second re-renders.
const PROGRESS_REFRESH_INTERVAL_MS = 30_000;

type ProgressDescription = {
  key: string;
  options?: {
    count: number;
  };
};

const getProgressDescription = (
  workflowProgress: WorkflowProgress,
): ProgressDescription => {
  if (workflowProgress.status === 'done') {
    return { key: 'redesign.aiAnalysis.progress.done' };
  }

  if (workflowProgress.status === 'overEstimate') {
    return { key: 'redesign.aiAnalysis.progress.almostDone' };
  }

  return {
    key: `redesign.aiAnalysis.progress.remainingTime.${workflowProgress.remainingTime.unit}`,
    options: {
      count: workflowProgress.remainingTime.count,
    },
  };
};

/** Renders one AI-analysis task card with predicted progress while it runs. */
export const AiAnalysisTaskCard = (props: {
  iconStroke: string;
  task: AiAnalysisTaskConfig;
  taskProgress: TaskProgress;
}) => {
  const { iconStroke, task, taskProgress } = props;
  const workflowProgress = useWorkflowProgress({
    estimatedDurationMs: task.estimatedDurationMs,
    isDone: taskProgress.isDone,
    isRunning: taskProgress.isLoading,
    refreshIntervalMs: PROGRESS_REFRESH_INTERVAL_MS,
    workflow: taskProgress.workflow,
  });
  const progressDescription = getProgressDescription(workflowProgress);
  const Icon = task.icon;

  return (
    <RunningResultCard
      icon={
        <Icon aria-hidden="true" className={ICON_CLASS} stroke={iconStroke} />
      }
      titleKey={task.titleKey}
      descriptionKey={task.descriptionKey}
      showProgress={taskProgress.isLoading}
      progress={workflowProgress.progress}
      progressDescriptionKey={
        taskProgress.isLoading ? progressDescription.key : undefined
      }
      progressDescriptionOptions={
        taskProgress.isLoading ? progressDescription.options : undefined
      }
    />
  );
};
