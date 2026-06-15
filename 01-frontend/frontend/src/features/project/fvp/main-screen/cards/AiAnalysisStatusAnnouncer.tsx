import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type AiAnalysisStatusAnnouncerProps = {
  isRunning: boolean;
};

/**
 * Persistent polite live region that announces only the start and completion of
 * an AI analysis run. A run can take hours, so progress is intentionally not
 * announced to avoid spamming screen readers; only the start and completion
 * transitions are surfaced. The region stays mounted so transitions are reliably
 * announced (a freshly mounted live region is not).
 *
 * @param props Current running state of the AI analysis workflow.
 * @returns A visually hidden status region whose text changes on transitions.
 */
export const AiAnalysisStatusAnnouncer = (
  props: AiAnalysisStatusAnnouncerProps,
) => {
  const { isRunning } = props;
  const { t } = useTranslation('FormalCompletenessCheck');
  // eslint-disable-next-line no-restricted-syntax -- transient live-region message is ephemeral UI state that should not be stored in the URL.
  const [announcement, setAnnouncement] = useState('');
  const previousIsRunningRef = useRef(isRunning);

  // eslint-disable-next-line no-restricted-syntax -- live-region announcements are transition effects; render must stay pure for React Compiler.
  useEffect(() => {
    if (previousIsRunningRef.current !== isRunning) {
      // eslint-disable-next-line react-you-might-not-need-an-effect/no-derived-state -- the live region announces transitions only; deriving from current props would repeat stale start/complete text.
      setAnnouncement(
        isRunning
          ? t('redesign.aiAnalysis.announcer.started')
          : t('redesign.aiAnalysis.announcer.completed'),
      );
      previousIsRunningRef.current = isRunning;
    }
  }, [isRunning, t]);

  return (
    <p role="status" className="sr-only">
      {announcement}
    </p>
  );
};
