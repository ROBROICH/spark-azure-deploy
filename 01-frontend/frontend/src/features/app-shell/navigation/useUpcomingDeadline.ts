import { v1ProjectLogicListDeadlines } from '@/api-clients/backend';
import { skipToken, useQuery } from '@tanstack/react-query';
import { differenceInDays, format, parseISO, startOfDay } from 'date-fns';
import { useTranslation } from 'react-i18next';

const UPCOMING_THRESHOLD_DAYS = 30;

export type UpcomingDeadline = {
  label: string;
  days: number;
  isError: boolean;
};

/**
 * Uses a server-selected upcoming event so older loaded pages cannot hide it.
 * @param projectId - Authorized project whose navigation is being rendered.
 * @param enabled - Whether the feature may read deadlines.
 * @returns A near-term label, an explicit read error, or no upcoming event.
 */
export function useUpcomingDeadline(
  projectId: string,
  enabled: boolean,
): UpcomingDeadline | null {
  const { t } = useTranslation('shared');
  const today = format(new Date(), 'yyyy-MM-dd');
  const result = useQuery({
    queryKey: ['upcoming-deadline', projectId, today],
    queryFn:
      enabled && projectId
        ? async () => {
            const { data } = await v1ProjectLogicListDeadlines({
              query: { projectId, endingOnOrAfter: today, limit: 1, offset: 0 },
              throwOnError: true,
            });
            return data[0] ?? null;
          }
        : skipToken,
  });
  if (!enabled) {
    return null;
  }
  if (result.isError) {
    return { label: '', days: 0, isError: true };
  }
  if (!result.data) {
    return null;
  }

  const days = differenceInDays(
    startOfDay(parseISO(result.data.endAt)),
    startOfDay(parseISO(today)),
  );
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
