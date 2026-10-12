import { useEwmsDocuments } from '@/features/project/ewms/data/useEwmsDocuments';
import { getEwmsLoadingPredictionDurationMs } from '@/features/project/ewms/ewmsLoadingPrediction';
import { FakeProgress } from '@/features/workflow-runtime/workflow-status/FakeProgress';
import { useWorkflowProgress } from '@/features/workflow-runtime/workflow-status/useWorkflowProgress';
import type { WorkflowStartTimeSource } from '@/features/workflow-runtime/workflow-status/workflowProgressPrediction';
import { AiSparklesChip } from '@/features/ui/ai/AiSparklesChip';
import { useTranslation } from 'react-i18next';

const FALLBACK_BATCH_FILE_COUNT = 100;

type EwmsLoadingPageProps = {
  projectId: string;
  workflow?: WorkflowStartTimeSource;
};

/** Renders the first-run EWMS analysis page with a document-count based fake progress estimate. */
export const EwmsLoadingPage = (props: EwmsLoadingPageProps) => {
  const { projectId, workflow } = props;
  const { t } = useTranslation('Ewms');
  const { documents } = useEwmsDocuments(projectId);
  const batchFileCount =
    documents.length > 0 ? documents.length : FALLBACK_BATCH_FILE_COUNT;
  const estimatedDurationMs =
    getEwmsLoadingPredictionDurationMs(batchFileCount);
  const workflowProgress = useWorkflowProgress({
    estimatedDurationMs,
    workflow: workflow ?? { workflowStartTime: null },
  });
  const progressDescriptionKey =
    workflowProgress.status === 'overEstimate'
      ? 'loadingPage.progress.almostDone'
      : `loadingPage.progress.remainingTime.${workflowProgress.remainingTime.unit}`;
  const progressDescriptionOptions =
    workflowProgress.status === 'overEstimate'
      ? undefined
      : { count: workflowProgress.remainingTime.count };

  return (
    <div className="flex flex-1 items-center justify-center bg-white px-4 py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <AiSparklesChip
          size="md"
          className="size-12 rounded-xl"
          iconClassName="size-6"
          aria-hidden
        />

        <p className="text-base leading-6 font-medium text-ki">
          {t('loadingPage.heading')}
        </p>

        <p className="text-[13px] leading-[18px] text-slate-600">
          {t('loadingPage.description')}
        </p>

        <FakeProgress
          {...workflowProgress}
          ariaLabel={t('loadingPage.progressLabel')}
          description={t(progressDescriptionKey, progressDescriptionOptions)}
        />
      </div>
    </div>
  );
};
