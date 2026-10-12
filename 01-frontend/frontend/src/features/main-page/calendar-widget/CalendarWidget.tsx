import {
  v1ProjectLogicListDeadlineDates,
  v1ProjectLogicListDeadlines,
} from '@/api-clients/backend';
import { v1ProjectLogicGetProjectOptions } from '@/api-clients/backend/@tanstack/react-query.gen';
import { deadlineResponseArraySchema } from '@/features/main-page/data/schemas/apiResponse.schema';
import { Button } from '@/features/ui/button/Button';
import { Calendar } from '@/features/ui/calendar/Calendar';
import { getDateLocale } from '@/i18n/dateLocale';
import { useInfiniteQuery, useQueries } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { addMonths, startOfMonth, subMonths } from 'date-fns';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDayButtonWithEvents } from './CalendarDayButtonWithEvents';
import { CalendarEventDatesContext } from './CalendarDayButton';
import { CalendarEventsPanel } from './CalendarEventsPanel';
import type { CalendarEvent } from './calendarTypes';
import { formatDateKey, parseDateKey } from './calendarUtils';

const route = getRouteApi('/');

/**
 * Month markers remain complete independently of the selected day's event pages.
 * @returns The calendar and its explicitly paged event list.
 */
export const CalendarWidget = () => {
  const calendarDate = route.useSearch({
    select: (search) => search.calendarDate,
  });
  const navigate = route.useNavigate();
  const { t, i18n } = useTranslation('Dashboard');
  const locale = getDateLocale(i18n.language);
  const selectedDate = calendarDate ? parseDateKey(calendarDate) : new Date();
  const selectedDateKey = formatDateKey(selectedDate);
  // eslint-disable-next-line no-restricted-syntax -- the browsed month is an ephemeral calendar viewport, independent of the URL-selected event date.
  const [month, setMonth] = useState(selectedDate);
  const deadlines = useInfiniteQuery({
    queryKey: ['calendar-deadlines', selectedDateKey],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const { data } = await v1ProjectLogicListDeadlines({
        query: { date: selectedDateKey, limit: 50, offset: pageParam },
        throwOnError: true,
      });
      return deadlineResponseArraySchema.parse(data);
    },
    getNextPageParam: (lastPage, _pages, lastPageParam) =>
      lastPage.length === 50 ? lastPageParam + lastPage.length : undefined,
  });
  const rawDeadlines = deadlines.data?.pages.flat() ?? [];
  const projects = useQueries({
    queries: [...new Set(rawDeadlines.map(({ projectId }) => projectId))].map(
      (projectId) => v1ProjectLogicGetProjectOptions({ path: { projectId } }),
    ),
  });
  const markers = useQueries({
    queries: [subMonths(month, 1), month, addMonths(month, 1)].map(
      (visibleMonth) => {
        const monthKey = formatDateKey(startOfMonth(visibleMonth));
        return {
          queryKey: ['deadline-dates', monthKey],
          queryFn: async () => {
            const { data } = await v1ProjectLogicListDeadlineDates({
              query: { month: monthKey },
              throwOnError: true,
            });
            return data;
          },
        };
      },
    ),
  });
  const projectNameById = new Map(
    projects.flatMap(({ data }) =>
      data ? [[data.id, data.name] as const] : [],
    ),
  );
  const selectedEvents: CalendarEvent[] = rawDeadlines.map((deadline) => ({
    ...deadline,
    projectName: projectNameById.get(deadline.projectId) ?? '',
  }));
  const isLoading =
    deadlines.isLoading || markers.some((marker) => marker.isLoading);
  const isError = deadlines.isError || markers.some((marker) => marker.isError);
  const [previousMonthDates, currentMonthDates, nextMonthDates] = markers.map(
    (marker) => marker.data?.dates,
  );
  // eslint-disable-next-line no-restricted-syntax -- context consumers need a stable date set when marker data has not changed.
  const eventDates = useMemo(
    () =>
      new Set([
        ...(previousMonthDates ?? []),
        ...(currentMonthDates ?? []),
        ...(nextMonthDates ?? []),
      ]),
    [previousMonthDates, currentMonthDates, nextMonthDates],
  );

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      setMonth(date);
      navigate({
        search: (prev) => ({ ...prev, calendarDate: formatDateKey(date) }),
      });
    } else {
      navigate({
        search: (prev) => {
          const { calendarDate: _, ...rest } = prev;
          return rest;
        },
      });
    }
  };
  const selectedDateLongLabel = selectedDate.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex h-full flex-col gap-5 md:flex-row">
      <CalendarEventDatesContext.Provider value={eventDates}>
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={handleDateSelect}
          month={month}
          onMonthChange={setMonth}
          captionLayout="dropdown"
          className="[--cell-size:--spacing(6)] sm:[--cell-size:--spacing(8)]"
          classNames={{
            day: 'px-1 [&_button]:flex [&_button]:items-center [&_button]:justify-center [&_button]:text-xs',
          }}
          components={{ DayButton: CalendarDayButtonWithEvents }}
        />
      </CalendarEventDatesContext.Provider>
      <div className="flex-1 overflow-auto rounded-md bg-bg-secondary p-4">
        <h4 className="mt-1 mb-4 text-center text-sm font-medium tracking-tight text-text-primary">
          {selectedDateLongLabel}
        </h4>
        <CalendarEventsPanel
          isError={isError}
          isLoading={isLoading}
          events={selectedEvents}
          locale={locale}
          selectedDateLongLabel={selectedDateLongLabel}
          onRetry={() => {
            void deadlines.refetch();
            for (const marker of markers) {
              void marker.refetch();
            }
          }}
        />
        {!isError && deadlines.hasNextPage && (
          <Button
            variant="secondary"
            size="sm"
            disabled={deadlines.isFetchingNextPage}
            onClick={() => void deadlines.fetchNextPage()}
          >
            {deadlines.isFetchingNextPage
              ? t('Calendar.loadingEvents')
              : t('Calendar.loadMore')}
          </Button>
        )}
      </div>
    </div>
  );
};
