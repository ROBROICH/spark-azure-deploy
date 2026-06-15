import { allDeadlinesCollection } from '@/features/main-page/data/collections/allDeadlines.collection';
import {
  projectsCollection,
  useAllProjects,
} from '@/features/project/data/collections/projects.collection';
import { Calendar } from '@/features/ui/calendar/Calendar';
import { getDateLocale } from '@/i18n/dateLocale';
import { useLiveQuery } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDayButtonWithEvents } from './CalendarDayButtonWithEvents';
import { CalendarEventDatesContext } from './CalendarDayButton';
import { CalendarEventsPanel } from './CalendarEventsPanel';
import type { CalendarEvent } from './calendarTypes';
import { formatDateKey, parseDateKey } from './calendarUtils';

const route = getRouteApi('/');

/** Refetches the deadline and project collections so a failed load can recover. */
const retryCalendarData = () => {
  void allDeadlinesCollection.utils.refetch();
  void projectsCollection.utils.refetch();
};

/**
 * Calendar widget component that displays a calendar and events for the selected date.
 * The selected date is stored in URL search params for shareability and state persistence.
 */
export const CalendarWidget = () => {
  const calendarDate = route.useSearch({
    select: (search) => search.calendarDate,
  });
  const navigate = route.useNavigate();
  const { i18n } = useTranslation('Dashboard');
  const locale = getDateLocale(i18n.language);

  const {
    data: allProjects,
    isLoading: isLoadingProjects,
    isError: isProjectsError,
  } = useAllProjects();

  const {
    data: rawDeadlines,
    isLoading: isLoadingDeadlines,
    isError: isDeadlinesError,
  } = useLiveQuery((q) => q.from({ deadlines: allDeadlinesCollection }));

  const projectNameById = new Map(allProjects.map((p) => [p.id, p.name]));

  const allDeadlines: CalendarEvent[] = rawDeadlines.map((d) => ({
    ...d,
    projectName: projectNameById.get(d.projectId) ?? '',
  }));

  const isLoading = isLoadingProjects || isLoadingDeadlines;
  const isError = isProjectsError || isDeadlinesError;

  const eventsData = (() => {
    const nextEventsData: Record<string, CalendarEvent[]> = {};

    for (const event of allDeadlines) {
      const startKey = event.startAt.slice(0, 10);
      const startEvents = nextEventsData[startKey] ?? [];
      startEvents.push(event);
      nextEventsData[startKey] = startEvents;

      const endKey = event.endAt.slice(0, 10);
      if (endKey !== startKey) {
        const endEvents = nextEventsData[endKey] ?? [];
        endEvents.push(event);
        nextEventsData[endKey] = endEvents;
      }
    }

    return nextEventsData;
  })();

  // Parse date from URL or default to today
  const selectedDate = calendarDate ? parseDateKey(calendarDate) : new Date();

  const selectedDateKey = formatDateKey(selectedDate);
  const selectedEvents = eventsData[selectedDateKey] ?? [];
  // eslint-disable-next-line no-restricted-syntax -- context value identity should only change when the event-date set changes.
  const eventDates = useMemo(
    () => new Set(Object.keys(eventsData)),
    [eventsData],
  );

  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
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
          captionLayout="dropdown"
          className="[--cell-size:--spacing(8)] md:[--cell-size:--spacing(8)]"
          classNames={{
            day: 'px-1 [&_button]:flex [&_button]:items-center [&_button]:justify-center [&_button]:text-xs',
          }}
          components={{
            DayButton: CalendarDayButtonWithEvents,
          }}
        />
      </CalendarEventDatesContext.Provider>

      <div className="flex-1 overflow-auto rounded-md bg-bg-secondary p-4">
        <h4 className="mt-1 mb-4 text-center text-sm font-medium text-text-primary">
          {selectedDateLongLabel}
        </h4>

        <CalendarEventsPanel
          isError={isError}
          isLoading={isLoading}
          events={selectedEvents}
          locale={locale}
          selectedDateLongLabel={selectedDateLongLabel}
          onRetry={retryCalendarData}
        />
      </div>
    </div>
  );
};
