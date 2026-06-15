import type { FvpAiWorkflowState } from '@/features/project/fvp/main-screen/useFvpAiWorkflowState';
import { AiSparklesChip } from '@/features/ui/ai/AiSparklesChip';
import { Button } from '@/features/ui/button/Button';
import { invariant } from 'es-toolkit/util';
import { LoaderCircle, Play } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { AiAnalysisStatusAnnouncer } from './AiAnalysisStatusAnnouncer';
import { AiAnalysisTaskCard } from './AiAnalysisTaskCard';
import {
  AI_ANALYSIS_TASKS,
  RESULT_CARD_BY_TASK_ID,
  type AiAnalysisTaskConfig,
  type AiAnalysisTaskId,
} from './aiAnalysisTasks';

const START_DISABLED_REASON_ID = 'fvp-ai-start-disabled-reason';

const systemLoadThresholdFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

type AiAnalysisWorkflowState = Pick<
  FvpAiWorkflowState,
  | 'isAiAnalysisRunning'
  | 'isAiAnalysisComplete'
  | 'disableThresholdPercentage'
  | 'isStartBlockedBySystemLoad'
  | 'isStartButtonDisabled'
  | 'isStartButtonLoading'
  | 'progress'
  | 'shouldShowStartAction'
  | 'startButtonDisabledReason'
>;

type AiAnalysisSectionProps = {
  canMutateProject?: boolean;
  projectId: string;
  onStartClick: () => void;
  workflow: AiAnalysisWorkflowState;
};

type DisabledTooltipConfig = {
  key: string;
  ns?: 'shared';
};

const AI_ANALYSIS_TASK_DEPENDENCIES = {
  tableOfContents: ['tableOfContents', 'requiredDocuments'],
  requiredDocuments: ['tableOfContents', 'requiredDocuments'],
  plausibility: ['plausibility'],
} satisfies Record<AiAnalysisTaskId, AiAnalysisTaskId[]>;

const START_DISABLED_TOOLTIP_BY_REASON = {
  systemLoad: {
    key: 'projectNavbar.startProcessDisabledBySystemLoad',
    ns: 'shared',
  },
  systemLoadError: {
    key: 'redesign.aiAnalysis.startDisabledSystemLoadErrorTooltip',
  },
  filesLoadError: {
    key: 'redesign.aiAnalysis.startDisabledFilesErrorTooltip',
  },
  missingDocuments: {
    key: 'redesign.aiAnalysis.startDisabledNoDocumentsTooltip',
  },
} satisfies Record<
  NonNullable<AiAnalysisWorkflowState['startButtonDisabledReason']>,
  DisabledTooltipConfig
>;

const formatSystemLoadThresholdPercentage = (threshold: number) =>
  systemLoadThresholdFormatter.format(threshold);

/** Renders the FVP AI overview card and switches its cards to fake progress while workflows run. */
export const AiAnalysisSection = (props: AiAnalysisSectionProps) => {
  const { canMutateProject = true, onStartClick, projectId, workflow } = props;
  const { t } = useTranslation(['FormalCompletenessCheck', 'shared']);
  const rawId = useId();
  const gradientId = `fvpRunningIconGradient${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const iconStroke = `url(#${gradientId})`;

  const shouldShowHeader = !workflow.isAiAnalysisComplete;
  const startDisabledReason: DisabledTooltipConfig | undefined =
    shouldShowHeader &&
    workflow.shouldShowStartAction &&
    !workflow.isAiAnalysisRunning &&
    workflow.startButtonDisabledReason
      ? START_DISABLED_TOOLTIP_BY_REASON[workflow.startButtonDisabledReason]
      : undefined;
  const startDisabledReasonText = startDisabledReason
    ? t(startDisabledReason.key, {
        ns: startDisabledReason.ns,
        threshold: formatSystemLoadThresholdPercentage(
          workflow.disableThresholdPercentage,
        ),
      })
    : undefined;

  /** Running indicator, disabled start button, or the active start button. */
  const renderHeaderAction = () => {
    if (!workflow.shouldShowStartAction && !workflow.isAiAnalysisRunning) {
      return null;
    }

    const isStartDisabled = workflow.isStartButtonDisabled || !canMutateProject;

    if (workflow.isAiAnalysisRunning) {
      // Start/completion are announced by AiAnalysisStatusAnnouncer; this visible
      // indicator is not a live region to avoid duplicate announcements.
      return (
        <span className="inline-flex shrink-0 items-center gap-2 px-2 py-1 text-xs leading-4 font-medium tracking-[0.02em] text-purple-900">
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin text-purple-900"
          />
          {t('redesign.aiAnalysis.indicator')}
        </span>
      );
    }

    if (isStartDisabled) {
      // Reason shown as always-visible helper text below (keyboard/SR reachable).
      return (
        <span className="inline-flex shrink-0">
          <Button
            type="button"
            size="sm"
            withIcon
            disabled
            loading={workflow.isStartButtonLoading}
            aria-describedby={
              startDisabledReasonText ? START_DISABLED_REASON_ID : undefined
            }
          >
            <Play aria-hidden="true" />
            {t('redesign.aiAnalysis.startButton')}
          </Button>
        </span>
      );
    }

    return (
      <Button
        type="button"
        size="sm"
        withIcon
        className="shrink-0"
        onClick={onStartClick}
      >
        <Play aria-hidden="true" />
        {t('redesign.aiAnalysis.startButton')}
      </Button>
    );
  };

  const renderTaskSlot = (task: AiAnalysisTaskConfig) => {
    const dependencyProgress = AI_ANALYSIS_TASK_DEPENDENCIES[task.id].map(
      (dependencyId) => workflow.progress[dependencyId],
    );
    const firstDependencyProgress = dependencyProgress.at(0);
    invariant(
      firstDependencyProgress !== undefined,
      'Expected AI task dependency',
    );
    const taskProgress = {
      isDone: dependencyProgress.every((progress) => progress.isDone),
      isLoading: dependencyProgress.some((progress) => progress.isLoading),
      workflow:
        dependencyProgress.find((progress) => progress.isLoading)?.workflow ??
        firstDependencyProgress.workflow,
    };

    if (taskProgress.isDone) {
      const ResultCard = RESULT_CARD_BY_TASK_ID[task.id];
      return <ResultCard projectId={projectId} />;
    }

    return (
      <AiAnalysisTaskCard
        iconStroke={iconStroke}
        task={task}
        taskProgress={taskProgress}
      />
    );
  };

  return (
    <section
      aria-label={t('redesign.aiAnalysis.title')}
      className="flex flex-col gap-4"
    >
      <AiAnalysisStatusAnnouncer isRunning={workflow.isAiAnalysisRunning} />

      <svg width="0" height="0" className="absolute" aria-hidden="true">
        <defs>
          <linearGradient
            id={gradientId}
            x1="0"
            y1="0"
            x2="0"
            y2="32"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="rgba(147, 51, 234, 1)" />
            <stop offset="100%" stopColor="rgba(88, 28, 135, 1)" />
          </linearGradient>
        </defs>
      </svg>

      {shouldShowHeader && (
        <div className="flex flex-col gap-4 rounded-3xl bg-purple-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <AiSparklesChip size="sm" />
            <h2 className="min-w-0 flex-1 text-base leading-5 font-medium text-purple-900">
              {t('redesign.aiAnalysis.title')}
            </h2>
            {renderHeaderAction()}
          </div>
          <p className="text-sm leading-[18px] text-purple-900">
            {t('redesign.aiAnalysis.description')}
          </p>
          {startDisabledReasonText && (
            <p
              id={START_DISABLED_REASON_ID}
              className="text-xs leading-4 font-medium text-purple-900"
            >
              {startDisabledReasonText}
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {AI_ANALYSIS_TASKS.map((task) => (
          <div key={task.id} className="min-w-0">
            {renderTaskSlot(task)}
          </div>
        ))}
      </div>
    </section>
  );
};
