import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TanstackReactRouter from '@tanstack/react-router';
import type * as ReactI18Next from 'react-i18next';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarWidget } from './CalendarWidget';

const useSearchMock = vi.fn();
const navigateMock = vi.fn();
const useAllProjectsMock = vi.fn();
const useLiveQueryMock = vi.fn();
const deadlinesRefetchMock = vi.fn(() => Promise.resolve());
const projectsRefetchMock = vi.fn(() => Promise.resolve());
let language = 'de';

vi.mock('@/features/ui/calendar/Calendar', () => ({
  Calendar: () => <div data-testid="calendar" />,
}));

vi.mock('@/i18n/dateLocale', () => ({
  getDateLocale: (lang?: string) =>
    (lang ?? language).startsWith('en') ? 'en-GB' : 'de-DE',
}));

vi.mock(
  '@/features/main-page/data/collections/allDeadlines.collection',
  () => ({
    allDeadlinesCollection: {
      utils: { refetch: () => deadlinesRefetchMock() },
    },
  }),
);

vi.mock('@/features/project/data/collections/projects.collection', () => ({
  projectsCollection: { utils: { refetch: () => projectsRefetchMock() } },
  useAllProjects: () => useAllProjectsMock(),
}));

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: (...args: unknown[]) => useLiveQueryMock(...args),
}));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof TanstackReactRouter>();

  return {
    ...actual,
    Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
    getRouteApi: () => ({
      useNavigate: () => navigateMock,
      useSearch: (options?: {
        select?: (search: Record<string, unknown>) => unknown;
      }) => useSearchMock(options),
    }),
  };
});

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactI18Next>();

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) =>
        options && 'date' in options ? `${key}:${String(options.date)}` : key,
      i18n: { language },
    }),
  };
});

const deadlineEvent = {
  id: 'deadline-1',
  projectId: 'project-1',
  deadlineType: 'Frist',
  startAt: '2024-03-05T00:00:00.000Z',
  endAt: '2024-03-05T00:00:00.000Z',
  legalBasis: null,
};

describe('CalendarWidget', () => {
  beforeEach(() => {
    language = 'de';
    navigateMock.mockClear();
    deadlinesRefetchMock.mockClear();
    projectsRefetchMock.mockClear();
    useSearchMock.mockReset();
    useSearchMock.mockImplementation((options) =>
      options?.select ? options.select({ calendarDate: '2024-03-05' }) : {},
    );
    useAllProjectsMock.mockReset();
    useLiveQueryMock.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllTimers();
  });

  it('reads only the calendarDate field from route search', () => {
    useAllProjectsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    useLiveQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    render(<CalendarWidget />);

    const selectCalls = useSearchMock.mock.calls.filter(
      ([options]) => typeof options?.select === 'function',
    );
    expect(selectCalls.length).toBeGreaterThan(0);

    const [{ select }] = selectCalls[0] as [
      { select: (search: Record<string, unknown>) => unknown },
    ];
    expect(select({ calendarDate: '2024-03-05', search: 'noise' })).toBe(
      '2024-03-05',
    );
  });

  it('announces a loading status region while data is loading', () => {
    useAllProjectsMock.mockReturnValue({
      data: [],
      isLoading: true,
      isError: false,
    });
    useLiveQueryMock.mockReturnValue({
      data: [],
      isLoading: true,
      isError: false,
    });

    render(<CalendarWidget />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('renders a retryable error state instead of an empty calendar', async () => {
    const user = userEvent.setup();
    useAllProjectsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    useLiveQueryMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: true,
    });

    render(<CalendarWidget />);

    expect(screen.getByRole('alert')).toHaveTextContent('Calendar.loadError');
    expect(screen.queryByText('Calendar.noEvents:2024-03-05')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'retry' }));

    expect(deadlinesRefetchMock).toHaveBeenCalledTimes(1);
    expect(projectsRefetchMock).toHaveBeenCalledTimes(1);
  });

  it('formats the selected-date heading using the active language', () => {
    useAllProjectsMock.mockReturnValue({
      data: [{ id: 'project-1', name: 'Alpha' }],
      isLoading: false,
      isError: false,
    });
    useLiveQueryMock.mockReturnValue({
      data: [deadlineEvent],
      isLoading: false,
      isError: false,
    });

    const { rerender, container } = render(<CalendarWidget />);
    const germanHeading = container.querySelector('h4')?.textContent ?? '';
    expect(germanHeading).toContain('März');

    language = 'en';
    rerender(<CalendarWidget />);
    const englishHeading = container.querySelector('h4')?.textContent ?? '';
    expect(englishHeading).toContain('March');
    expect(englishHeading).not.toBe(germanHeading);
  });
});
