import {
  getFakeProgressPercent,
  getFakeRemainingMinutes,
} from '@/features/workflow-runtime/progress/fakeProgress';
import { useSystemLoad } from '@/features/workflow-runtime/system-load/useSystemLoad';
import { Alert, AlertDescription } from '@/features/ui/alert/Alert';
import { Button } from '@/features/ui/button/Button';
import { ProgressBar } from '@/features/ui/progress-bar/ProgressBar';
import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { CloudUpload, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SchwaerzungsagentSession } from './schwaerzungsagentSession';

const SYSTEM_LOAD_CAVEAT_THRESHOLD = 80;

const formatSystemLoadPercentage = (
  loadPercentage: number,
  language: string | undefined,
) =>
  `${new Intl.NumberFormat(language, {
    maximumFractionDigits: 1,
  }).format(loadPercentage)}%`;

type SchwaerzungsagentProgressStepProps = {
  error: Error | null;
  onCancel: () => void;
  session: SchwaerzungsagentSession;
};

/**
 * Shows predicted processing progress and a cache-only system-load caveat while
 * the backend workflow is still running.
 */
export const SchwaerzungsagentProgressStep = (
  props: SchwaerzungsagentProgressStepProps,
) => {
  const { error, onCancel, session } = props;
  const { i18n, t } = useTranslation('Schwaerzungsagent');
  const systemLoad = useSystemLoad({ refetchInterval: false });
  // eslint-disable-next-line no-restricted-syntax -- ticking clock drives the local progress indicator only.
  const [now, setNow] = useState(() => Date.now());

  // eslint-disable-next-line no-restricted-syntax -- progress is time-based and needs a browser timer.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);

    return () => window.clearInterval(interval);
  }, []);

  const progressPercent = getFakeProgressPercent({
    estimatedDurationMs: session.estimatedDurationMs,
    now,
    startedAt: session.startedAt,
  });
  const remainingMinutes = getFakeRemainingMinutes({
    estimatedDurationMs: session.estimatedDurationMs,
    now,
    startedAt: session.startedAt,
  });
  const loadPercentage = systemLoad.data?.load_percentage;
  const showSystemLoadCaveat =
    loadPercentage !== undefined &&
    loadPercentage > SYSTEM_LOAD_CAVEAT_THRESHOLD;
  const formattedSystemLoad =
    loadPercentage === undefined
      ? ''
      : formatSystemLoadPercentage(
          loadPercentage,
          i18n.resolvedLanguage ?? i18n.language,
        );
  const progressMessage =
    progressPercent >= 90
      ? t('processing.almostDone')
      : t('processing.remainingTime', { count: remainingMinutes });

  return (
    <div className="mt-4 flex min-h-[260px] items-center justify-center rounded-lg bg-bg-secondary px-8 py-10">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <CloudUpload className="size-8 text-brand-950" aria-hidden />

        <div
          className="mt-5 flex flex-col items-center gap-1"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="text-base leading-6 font-medium text-brand-950">
            {t('processing.heading')}
          </p>
          <p className="text-[13px] leading-[18px] text-text-secondary">
            {t('processing.description', {
              filename: session.originalFilename,
            })}
          </p>
        </div>

        <ProgressBar
          ariaLabel={t('processing.progressLabel')}
          className="mt-6 h-2 w-full overflow-hidden rounded-full border border-border-primary bg-bg-secondary [&>span]:bg-brand-950 [&>span]:bg-none"
          progress={progressPercent / 100}
        />

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-[13px] leading-[18px] text-text-secondary">
          <span>{progressMessage}</span>
          {showSystemLoadCaveat ? (
            <span className="inline-flex items-center gap-1 text-text-secondary">
              <span>
                {t('processing.highLoadLabel', { load: formattedSystemLoad })}
              </span>
              <TooltipWrapper
                content={t('processing.highLoadTooltip')}
                side="top"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  iconOnly
                  className="size-4 text-text-secondary hover:text-brand-950"
                  aria-label={t('processing.highLoadTooltipAriaLabel')}
                >
                  <Info className="size-3.5" aria-hidden="true" />
                </Button>
              </TooltipWrapper>
            </span>
          ) : null}
        </div>

        {error ? (
          <Alert
            variant="destructive"
            className="mt-4 flex w-auto rounded-md border-border-error bg-highlight-error px-3 py-2 text-[13px] leading-[18px] text-text-error"
          >
            <AlertDescription className="col-auto text-[13px] leading-[18px] text-text-error">
              {t('processing.error')}
            </AlertDescription>
          </Alert>
        ) : null}

        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-6"
          onClick={onCancel}
        >
          {t('processing.cancel')}
        </Button>
      </div>
    </div>
  );
};
