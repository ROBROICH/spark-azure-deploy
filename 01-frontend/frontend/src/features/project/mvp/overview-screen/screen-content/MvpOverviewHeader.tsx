import { CompletionIndicator } from '@/features/ui/completion-indicator/CompletionIndicator';
import { useTranslation } from 'react-i18next';

type MvpOverviewHeaderProps = {
  completedTopics: number;
  totalTopics: number;
};

export const MvpOverviewHeader = (props: MvpOverviewHeaderProps) => {
  const { completedTopics, totalTopics } = props;
  const { t } = useTranslation('MaterialCompletenessCheck');

  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 items-center justify-center rounded-lg bg-slate-200">
        <span className="text-sm font-bold text-[#1E1D49]" aria-hidden="true">
          §
        </span>
      </div>
      <h2 className="flex-1 text-base leading-5 font-medium tracking-[-0.01em] text-[#1E1D49]">
        {t('TopicWorkflow.overview.title')}
      </h2>
      <CompletionIndicator completed={completedTopics} total={totalTopics}>
        {t('TopicWorkflow.overview.completedTopicsProgress', {
          completed: completedTopics,
          total: totalTopics,
        })}
      </CompletionIndicator>
    </div>
  );
};
