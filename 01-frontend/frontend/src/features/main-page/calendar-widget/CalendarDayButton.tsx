import { CalendarDayButton } from '@/features/ui/calendar/Calendar';
import { getDateLocale } from '@/i18n/dateLocale';
import { cn } from '@/features/ui/style/cn';
import React, { createContext } from 'react';
import type { DayButton } from 'react-day-picker';
import { useTranslation } from 'react-i18next';
import { formatDateKey } from './calendarUtils';

export const CalendarEventDatesContext = createContext<Set<string>>(new Set());

export type CalendarDayButtonWithDotProps = React.ComponentProps<
  typeof DayButton
> & {
  eventDates: Set<string>;
};

export const CalendarDayButtonWithDot = (
  props: CalendarDayButtonWithDotProps,
) => {
  const { day, modifiers, className, eventDates, ...rest } = props;
  const dateKey = formatDateKey(day.date);
  const hasEvents = eventDates.has(dateKey);
  const { t, i18n } = useTranslation('Dashboard');
  const dateLabel = day.date.toLocaleDateString(getDateLocale(i18n.language), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <CalendarDayButton
      day={day}
      modifiers={modifiers}
      aria-label={
        hasEvents
          ? t('Calendar.hasEvents', { date: dateLabel })
          : t('Calendar.noEvents', { date: dateLabel })
      }
      className={cn(
        'flex items-center justify-center rounded-md border-[0.5px] border-border-tertiary bg-bg-primary text-xs text-text-secondary transition-colors hover:bg-bg-tertiary',
        modifiers.selected &&
          'rounded-md! border-brand-950! bg-brand-950! font-medium! text-text-invert!',
        className,
      )}
      {...rest}
    >
      <span>{day.date.getDate()}</span>
      {hasEvents && !modifiers.outside && (
        <span
          aria-hidden
          className={cn(
            'absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full',
            modifiers.selected ? 'bg-white' : 'bg-brand-950',
          )}
        />
      )}
    </CalendarDayButton>
  );
};
