'use client';

import type { ComponentProps } from 'react';
import { useEffect, useRef } from 'react';
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
} from 'react-day-picker';
import { de, enUS } from 'react-day-picker/locale';
import { useTranslation } from 'react-i18next';

import { buttonVariants } from '@/features/ui/button/Button';
import { cn } from '@/features/ui/style/cn';
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from 'lucide-react';

// eslint-disable-next-line custom-jsdoc/require-jsdoc-complexity -- DayPicker primitive wrapper is self-described by react-day-picker props.
function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = 'label',
  navLayout,
  formatters,
  components,
  locale: localeProp,
  ...props
}: ComponentProps<typeof DayPicker>) {
  const defaultClassNames = getDefaultClassNames();
  const { i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith('en') ? 'en-US' : 'de-DE';
  const dayPickerLocale =
    localeProp ?? (i18n.language.startsWith('en') ? enUS : de);
  const usesDropdownCaption =
    captionLayout === 'dropdown' ||
    captionLayout === 'dropdown-months' ||
    captionLayout === 'dropdown-years';
  const resolvedNavLayout =
    navLayout ?? (usesDropdownCaption ? 'around' : undefined);
  const usesAroundNav = resolvedNavLayout === 'around';

  /* eslint-disable react/no-unstable-nested-components -- react-day-picker requires inline component overrides via its components prop */
  return (
    <DayPicker
      locale={dayPickerLocale}
      weekStartsOn={1}
      showOutsideDays={showOutsideDays}
      className={cn(
        'bg-background group/calendar rounded-md bg-bg-secondary p-4 [--cell-radius:var(--radius-md)] [--cell-size:--spacing(6)] in-data-[slot=card-content]:bg-transparent in-data-[slot=popover-content]:bg-transparent sm:[--cell-size:--spacing(7)]',
        'rtl:**:[.rdp-button\\_next>svg]:rotate-180',
        'rtl:**:[.rdp-button\\_previous>svg]:rotate-180',
        className,
      )}
      captionLayout={captionLayout}
      navLayout={resolvedNavLayout}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(dateLocale, { month: 'short' }),
        formatYearDropdown: (date) =>
          date.toLocaleString(dateLocale, { year: 'numeric' }),
        formatWeekdayName: (date) =>
          date.toLocaleDateString(dateLocale, { weekday: 'short' }).slice(0, 1),
        ...formatters,
      }}
      classNames={{
        root: cn('w-fit max-w-full', defaultClassNames.root),
        months: cn(
          'relative flex flex-col gap-4 md:flex-row',
          defaultClassNames.months,
        ),
        month: cn(
          'relative flex w-full flex-col gap-4',
          defaultClassNames.month,
        ),
        nav: cn(
          'absolute inset-x-0 top-0 flex h-(--cell-size) w-full items-center justify-between gap-1',
          defaultClassNames.nav,
        ),
        button_previous: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-(--cell-size) p-0 text-text-primary select-none aria-disabled:opacity-50',
          usesAroundNav &&
            'absolute start-0 top-0 z-10 inline-flex h-(--cell-size) w-(--cell-size)',
          defaultClassNames.button_previous,
        ),
        button_next: cn(
          buttonVariants({ variant: 'ghost' }),
          'size-(--cell-size) p-0 text-text-primary select-none aria-disabled:opacity-50',
          usesAroundNav &&
            'absolute end-0 top-0 z-10 inline-flex h-(--cell-size) w-(--cell-size)',
          defaultClassNames.button_next,
        ),
        month_caption: cn(
          'relative box-border flex h-(--cell-size) w-full min-w-0 items-center justify-center px-(--cell-size)',
          defaultClassNames.month_caption,
        ),
        dropdowns: cn(
          'flex h-(--cell-size) min-w-0 items-center justify-center gap-1.5 text-sm font-medium text-text-primary',
          defaultClassNames.dropdowns,
        ),
        dropdown_root: cn(
          'focus-ring-within cn-calendar-dropdown-root relative rounded-(--cell-radius)',
          defaultClassNames.dropdown_root,
        ),
        dropdown: cn(
          'bg-popover absolute inset-0 z-10 cursor-pointer rounded-(--cell-radius) opacity-0 outline-none',
          defaultClassNames.dropdown,
        ),
        months_dropdown: cn(
          'cursor-pointer',
          defaultClassNames.months_dropdown,
        ),
        years_dropdown: cn('cursor-pointer', defaultClassNames.years_dropdown),
        caption_label: cn(
          'select-none',
          captionLayout === 'label'
            ? 'text-sm font-medium'
            : 'cn-calendar-caption-label flex items-center gap-1 rounded-(--cell-radius) text-sm font-medium text-text-primary [&>svg]:size-3.5 [&>svg]:text-text-primary',
          defaultClassNames.caption_label,
        ),
        table: 'w-full border-collapse',
        weekdays: cn('mb-2 flex', defaultClassNames.weekdays),
        weekday: cn(
          'flex-1 rounded-(--cell-radius) text-xs font-normal text-neutral-700 select-none',
          defaultClassNames.weekday,
        ),
        week: cn('mt-2 flex w-full', defaultClassNames.week),
        week_number_header: cn(
          'w-(--cell-size) select-none',
          defaultClassNames.week_number_header,
        ),
        week_number: cn(
          'text-muted-foreground text-[0.8rem] select-none',
          defaultClassNames.week_number,
        ),
        day: cn(
          'group/day relative aspect-square h-full w-full rounded-(--cell-radius) p-0 text-center select-none [&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)',
          props.showWeekNumber
            ? '[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)'
            : '[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)',
          defaultClassNames.day,
        ),
        selected: cn(
          '[&_button]:rounded-full [&_button]:!bg-brand-950 [&_button]:!text-text-invert [&_button:hover]:!bg-brand-950 [&_button:hover]:!text-text-invert',
          defaultClassNames.selected,
        ),
        range_start: cn(
          'relative isolate -z-0 rounded-l-(--cell-radius) bg-bg-secondary after:absolute after:inset-y-0 after:right-0 after:w-4 after:bg-bg-secondary',
          defaultClassNames.range_start,
        ),
        range_middle: cn('rounded-none', defaultClassNames.range_middle),
        range_end: cn(
          'relative isolate -z-0 rounded-r-(--cell-radius) bg-bg-secondary after:absolute after:inset-y-0 after:left-0 after:w-4 after:bg-bg-secondary',
          defaultClassNames.range_end,
        ),
        today: cn(
          'rounded-(--cell-radius) bg-bg-secondary text-text-primary data-[selected=true]:rounded-none',
          defaultClassNames.today,
        ),
        outside: cn(
          'text-muted-foreground aria-selected:text-muted-foreground',
          defaultClassNames.outside,
        ),
        disabled: cn(
          'text-muted-foreground opacity-50',
          defaultClassNames.disabled,
        ),
        hidden: cn('invisible', defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className: rootClassName, rootRef, ...rootProps }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(rootClassName)}
              {...rootProps}
            />
          );
        },
        Chevron: ({
          className: chevronClassName,
          orientation,
          ...chevronProps
        }) => {
          if (orientation === 'left') {
            return (
              <ChevronLeftIcon
                className={cn(
                  'size-4 text-text-primary forced-colors:text-[color:CanvasText]',
                  chevronClassName,
                )}
                {...chevronProps}
              />
            );
          }

          if (orientation === 'right') {
            return (
              <ChevronRightIcon
                className={cn(
                  'size-4 text-text-primary forced-colors:text-[color:CanvasText]',
                  chevronClassName,
                )}
                {...chevronProps}
              />
            );
          }

          return (
            <ChevronDownIcon
              className={cn(
                'size-4 text-text-primary forced-colors:text-[color:CanvasText]',
                chevronClassName,
              )}
              {...chevronProps}
            />
          );
        },
        DayButton: CalendarDayButton,
        Select: ({
          className: selectClassName,
          tabIndex,
          disabled,
          ...selectProps
        }) => {
          const finalTabIndex = disabled
            ? -1
            : tabIndex !== undefined
              ? tabIndex
              : 0;
          return (
            <select
              {...selectProps}
              disabled={disabled}
              tabIndex={finalTabIndex}
              className={cn('cursor-pointer', selectClassName)}
            />
          );
        },
        WeekNumber: ({ children, ...weekNumberProps }) => {
          return (
            <td {...weekNumberProps}>
              <div className="flex size-(--cell-size) items-center justify-center text-center">
                {children}
              </div>
            </td>
          );
        },
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({
  className,
  day,
  modifiers,
  ...props
}: ComponentProps<typeof DayButton>) {
  const ref = useRef<HTMLButtonElement>(null);
  const { i18n } = useTranslation();
  const dateLocale = i18n.language.startsWith('en') ? 'en-US' : 'de-DE';
  const dayLabel = day.date.toLocaleDateString(dateLocale, {
    dateStyle: 'full',
  });

  // eslint-disable-next-line no-restricted-syntax -- DayPicker exposes focused-day state through modifiers; the button must receive DOM focus.
  useEffect(() => {
    if (modifiers.focused) {
      ref.current?.focus();
    }
  }, [modifiers.focused]);

  return (
    <button
      ref={ref}
      aria-label={dayLabel}
      data-day={dayLabel}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        'focus-ring relative isolate z-10 flex aspect-square size-auto w-full min-w-(--cell-size) cursor-pointer flex-col gap-1 border-[0.5px] border-border-tertiary bg-bg-primary leading-none font-normal text-text-secondary transition-colors hover:bg-bg-tertiary',
        'data-[selected-single=true]:border-brand-950 data-[selected-single=true]:bg-brand-950 data-[selected-single=true]:text-text-invert',
        'data-[range-start=true]:rounded-(--cell-radius) data-[range-start=true]:rounded-l-(--cell-radius) data-[range-start=true]:border-brand-950 data-[range-start=true]:bg-brand-950 data-[range-start=true]:text-text-invert',
        'data-[range-end=true]:rounded-(--cell-radius) data-[range-end=true]:rounded-r-(--cell-radius) data-[range-end=true]:border-brand-950 data-[range-end=true]:bg-brand-950 data-[range-end=true]:text-text-invert',
        'data-[range-middle=true]:rounded-none data-[range-middle=true]:bg-bg-secondary data-[range-middle=true]:text-text-primary',
        '[&>span]:text-xs',
        className,
      )}
      {...props}
    />
  );
}

export { Calendar, CalendarDayButton };
