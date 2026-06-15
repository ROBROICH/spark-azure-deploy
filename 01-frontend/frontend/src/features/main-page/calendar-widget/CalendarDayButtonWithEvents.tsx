import React, { useContext } from 'react';
import {
  CalendarDayButtonWithDot,
  CalendarEventDatesContext,
} from './CalendarDayButton';

type CalendarDayButtonWithEventsProps = Omit<
  React.ComponentProps<typeof CalendarDayButtonWithDot>,
  'eventDates'
>;

export function CalendarDayButtonWithEvents(
  props: CalendarDayButtonWithEventsProps,
) {
  const eventDates = useContext(CalendarEventDatesContext);

  return <CalendarDayButtonWithDot {...props} eventDates={eventDates} />;
}
