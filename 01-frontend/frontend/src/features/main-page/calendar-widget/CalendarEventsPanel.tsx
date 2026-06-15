import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { Link } from '@tanstack/react-router';
import { CalendarIcon, FolderOpen, Scale } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DashboardErrorState } from '../dashboard-screen/DashboardErrorState';
import type { CalendarEvent } from './calendarTypes';
import { parseDateKey } from './calendarUtils';

type CalendarEventsPanelProps = {
  isError: boolean;
  isLoading: boolean;
  events: CalendarEvent[];
  locale: string;
  selectedDateLongLabel: string;
  onRetry: () => void;
};

/**
 * Renders the right-hand panel of the calendar widget for the selected day:
 * an error state, a loading skeleton, the event list, or an empty-state note.
 */
export const CalendarEventsPanel = (props: CalendarEventsPanelProps) => {
  const { isError, isLoading, events, locale, selectedDateLongLabel, onRetry } =
    props;
  const { t } = useTranslation('Dashboard');

  if (isError) {
    return (
      <DashboardErrorState
        message={t('Calendar.loadError')}
        onRetry={onRetry}
      />
    );
  }

  if (isLoading) {
    return (
      <ul
        className="space-y-2"
        role="status"
        aria-live="polite"
        aria-label={t('Calendar.loadingEvents')}
        {...skeletonListProps}
      >
        {Array.from({ length: 3 }).map((_, i) => (
          <li key={i}>
            <div className="flex w-full flex-row items-center rounded-md bg-bg-secondary p-4">
              <div className="w-full space-y-2">
                <Skeleton className="h-4 w-1/2" aria-hidden />
                <Skeleton className="h-4 w-2/3" aria-hidden />
                <Skeleton className="h-4 w-1/3" aria-hidden />
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-text-secondary">
        {t('Calendar.noEvents', { date: selectedDateLongLabel })}
      </p>
    );
  }

  const formatEventDate = (isoDate: string): string =>
    parseDateKey(isoDate.slice(0, 10)).toLocaleDateString(locale);

  return (
    <ul className="space-y-2">
      {events.map((event) => (
        <li key={event.id}>
          <Link
            to="/verfahren/$verfahrenId"
            params={(_prev) => ({ verfahrenId: event.projectId })}
            className="flex w-full flex-row items-center rounded-md border-[0.5px] border-border-tertiary bg-neutral-white p-4 hover:bg-bg-tertiary"
          >
            <div className="w-full">
              <h5 className="mb-3 text-[13px] font-medium text-text-primary">
                {event.deadlineType}
              </h5>
              <p className="mt-1 flex flex-row items-center gap-2 text-[11px] font-normal text-text-secondary">
                <CalendarIcon className="size-[13px]" aria-hidden />
                {formatEventDate(event.startAt)}
                {event.endAt !== event.startAt
                  ? ` – ${formatEventDate(event.endAt)}`
                  : ''}
              </p>
              {event.legalBasis && (
                <p className="mt-1 flex flex-row items-center gap-2 text-[11px] font-normal text-text-secondary">
                  <Scale className="size-[13px]" aria-hidden />
                  {event.legalBasis}
                </p>
              )}
              <p className="mt-1 flex flex-row items-center gap-2 text-[11px] font-normal text-text-secondary">
                <FolderOpen className="size-[13px]" aria-hidden />
                {event.projectName}
              </p>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
};
