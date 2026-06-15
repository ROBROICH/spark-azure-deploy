import { ProgressBar } from '@/features/ui/progress-bar/ProgressBar';
import type { TOptions } from 'i18next';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type RunningResultCardProps = {
  icon: ReactNode;
  titleKey: string;
  descriptionKey: string;
  progress?: number;
  progressDescriptionKey?: string;
  progressDescriptionOptions?: TOptions;
  showProgress?: boolean;
};

export const RunningResultCard = (props: RunningResultCardProps) => {
  const {
    icon,
    titleKey,
    descriptionKey,
    progress,
    progressDescriptionKey,
    progressDescriptionOptions,
    showProgress,
  } = props;
  const { t } = useTranslation('FormalCompletenessCheck');
  const titleId = useId();
  const shouldShowProgress = showProgress ?? progress !== undefined;

  return (
    <div className="flex h-fit flex-col items-center gap-4 rounded-lg border border-purple-400 bg-neutral-white p-4">
      <span aria-hidden="true" className="text-purple-900">
        {icon}
      </span>
      <div className="flex flex-1 flex-col items-stretch gap-2 self-stretch">
        <h3
          id={titleId}
          className="truncate text-center text-base leading-5 font-medium tracking-[-0.01em] text-purple-900"
        >
          {t(titleKey)}
        </h3>
        <p className="text-center text-sm leading-[18px] tracking-[-0.01em] text-purple-900">
          {t(descriptionKey)}
        </p>
      </div>
      {shouldShowProgress && (
        <div className="flex w-full flex-col gap-3">
          <ProgressBar ariaLabelledBy={titleId} progress={progress} />
          {progressDescriptionKey && (
            <p className="text-center text-[13px] leading-[18px] text-purple-900">
              {t(progressDescriptionKey, progressDescriptionOptions)}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
