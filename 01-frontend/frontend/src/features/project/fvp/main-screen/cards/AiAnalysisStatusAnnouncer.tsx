import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

type AiAnalysisStatusAnnouncerProps = {
  isIncomplete: boolean;
  isRunning: boolean;
};

const getFinishedAnnouncementKey = (isIncomplete: boolean) =>
  isIncomplete
    ? 'redesign.aiAnalysis.announcer.incomplete'
    : 'redesign.aiAnalysis.announcer.completed';

/**
 * Persistent polite live region that announces only the start and the end of
 * an AI analysis run. A run can take hours, so progress is intentionally not
 * announced to avoid spamming screen readers. The end is announced as complete,
 * or as incomplete when an area failed; a failure that arrives after the end
 * corrects that announcement once. The region stays mounted so transitions are
 * reliably announced (a freshly mounted live region is not).
 *
 * @param props Running state of the AI analysis workflow and whether an area
 *   of the latest run failed.
 * @returns A visually hidden status region whose text changes on transitions.
 */
export const AiAnalysisStatusAnnouncer = (
  props: AiAnalysisStatusAnnouncerProps,
) => {
  const { isIncomplete, isRunning } = props;
  const { t } = useTranslation('FormalCompletenessCheck');
  // eslint-disable-next-line no-restricted-syntax -- transient live-region message is ephemeral UI state that should not be stored in the URL.
  const [announcement, setAnnouncement] = useState('');
  const previousIsRunningRef = useRef(isRunning);
  const hasAnnouncedFinishRef = useRef(false);

  // eslint-disable-next-line no-restricted-syntax -- live-region announcements are transition effects; render must stay pure for React Compiler.
  useEffect(() => {
    if (previousIsRunningRef.current !== isRunning) {
      setAnnouncement(
        isRunning
          ? t('redesign.aiAnalysis.announcer.started')
          : t(getFinishedAnnouncementKey(isIncomplete)),
      );
      hasAnnouncedFinishRef.current = !isRunning;
      previousIsRunningRef.current = isRunning;
      return;
    }

    // The failure arrives with the history refresh after the run stops, so a
    // finish already announced as complete is corrected once.
    if (hasAnnouncedFinishRef.current && isIncomplete) {
      setAnnouncement(t(getFinishedAnnouncementKey(true)));
      hasAnnouncedFinishRef.current = false;
    }
  }, [isIncomplete, isRunning, t]);

  return (
    <p role="status" className="sr-only">
      {announcement}
    </p>
  );
};
