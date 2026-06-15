import { type DeadlineResponse } from '@/api-clients/pls-module';
import { deadlinesCollection } from '@/features/project/overview-screen/data/collections/deadlines.collection';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { differenceInDays, parseISO, startOfDay } from 'date-fns';
import { useTranslation } from 'react-i18next';

const UPCOMING_THRESHOLD_DAYS = 30;

export type UpcomingDeadline = {
  label: string;
  days: number;
  isError: boolean;
};

/**
 * Returns the soonest upcoming deadline within the threshold window for a project.
 * Only subscribes to the deadlines collection when `enabled` is true (e.g. when the
 * card is expanded). Returns null when disabled, when there is no upcoming deadline,
 * or propagates isError=true on collection load failure so callers can distinguish
 * failure from absence.
 */
export function useUpcomingDeadline(
  projectId: string,
  enabled: boolean,
): UpcomingDeadline | null {
  const { t } = useTranslation('shared');

  // useLiveQuery must be called unconditionally (rules of hooks).
  // We pass `enabled` in the deps so the query key updates, but we ignore
  // the result entirely when disabled to avoid unnecessary processing.
  const result = useLiveQuery(
    (q) =>
      q
        .from({ d: deadlinesCollection })
        .where(({ d }) => eq(d.projectId, projectId)),
    [projectId, enabled],
  ) as
    | {
        data: DeadlineResponse[] | undefined;
        isLoading: boolean;
        isError?: boolean;
      }
    | undefined;

  if (!enabled) {
    return null;
  }

  const isError = result?.isError ?? false;
  const data = result?.data;

  if (isError) {
    return { label: '', days: 0, isError: true };
  }

  if (!data || data.length === 0) {
    return null;
  }

  const now = startOfDay(new Date());
  const upcoming = data
    .map((d) => ({ ...d, endDate: startOfDay(parseISO(d.endAt)) }))
    .filter((d) => d.endDate >= now)
    .sort((a, b) => a.endDate.getTime() - b.endDate.getTime());

  const soonest = upcoming[0] as (typeof upcoming)[0] | undefined;
  if (!soonest) {
    return null;
  }

  const days = differenceInDays(soonest.endDate, now);
  if (days > UPCOMING_THRESHOLD_DAYS) {
    return null;
  }

  const label =
    days === 0
      ? t('upcomingDeadline.today')
      : days === 1
        ? t('upcomingDeadline.tomorrow')
        : t('upcomingDeadline.inDays', { count: days });

  return { label, days, isError: false };
}
