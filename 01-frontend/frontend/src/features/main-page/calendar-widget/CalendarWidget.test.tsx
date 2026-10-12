import '@testing-library/jest-dom/vitest';
import type { DeadlineResponse } from '@/api-clients/backend';
import { client } from '@/api-clients/backend/client.gen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TanstackReactRouter from '@tanstack/react-router';
import type * as ReactI18Next from 'react-i18next';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarWidget } from './CalendarWidget';

let language = 'de';
let failEvents = false;
let deadlines: DeadlineResponse[] = [];
const activeProjectId = '0e7f5c4d-0000-4000-8000-000000000001';
const deletedProjectId = '0e7f5c4d-0000-4000-8000-000000000002';

const deadline = (
  projectId: string,
  deadlineType: string,
): DeadlineResponse => ({
  id: crypto.randomUUID(),
  projectId,
  startAt: '2024-03-05T00:00:00.000Z',
  endAt: '2024-03-05T00:00:00.000Z',
  deadlineType,
  legalBasis: null,
  createdAt: '2024-03-01T00:00:00.000Z',
  updatedAt: '2024-03-01T00:00:00.000Z',
});
let testQueryClient: QueryClient;
const originalClientConfig = client.getConfig();

vi.mock('@/features/ui/calendar/Calendar', () => ({
  Calendar: () => <div data-testid="calendar" />,
}));
vi.mock('@/i18n/dateLocale', () => ({
  getDateLocale: (lang?: string) =>
    (lang ?? language).startsWith('en') ? 'en-GB' : 'de-DE',
}));
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof TanstackReactRouter>()),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  getRouteApi: () => ({
    useNavigate: () => vi.fn(),
    useSearch: (options: {
      select: (search: { calendarDate: string }) => unknown;
    }) => options.select({ calendarDate: '2024-03-05' }),
  }),
}));
vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactI18Next>()),
  useTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) =>
      options && 'date' in options ? `${key}:${String(options.date)}` : key,
    i18n: { language },
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={testQueryClient}>{children}</QueryClientProvider>
);

beforeEach(() => {
  language = 'de';
  failEvents = false;
  deadlines = [];
  testQueryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setConfig({
    baseUrl: 'http://calendar.test',
    fetch: (request) => {
      const url = new URL(
        request instanceof Request ? request.url : String(request),
      );
      if (url.pathname.endsWith('/deadline-dates')) {
        return Promise.resolve(Response.json({ dates: [] }));
      }
      if (url.pathname.endsWith('/deadlines')) {
        return Promise.resolve(
          failEvents
            ? new Response(null, { status: 503 })
            : Response.json(deadlines),
        );
      }
      if (url.pathname.endsWith(`/projects/${activeProjectId}`)) {
        return Promise.resolve(
          Response.json({
            id: activeProjectId,
            name: 'Ortsumgehung Nord',
          }),
        );
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    },
  });
});
afterEach(() => {
  cleanup();
  testQueryClient.clear();
  client.setConfig(originalClientConfig);
});

describe('CalendarWidget', () => {
  it('announces a loading status region while data is loading', () => {
    render(<CalendarWidget />, { wrapper });
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('recovers from a failed event request instead of presenting it as an empty calendar', async () => {
    failEvents = true;
    const user = userEvent.setup();
    render(<CalendarWidget />, { wrapper });
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Calendar.loadError',
    );
    expect(screen.queryByText(/^Calendar.noEvents:/)).not.toBeInTheDocument();

    failEvents = false;
    await user.click(screen.getByRole('button', { name: 'retry' }));
    expect(await screen.findByText(/^Calendar.noEvents:/)).toBeVisible();
  });

  it('keeps every deadline visible when a project name cannot be loaded', async () => {
    deadlines = [
      deadline(activeProjectId, 'Auslegungsfrist'),
      deadline(deletedProjectId, 'Einwendungsfrist'),
    ];
    render(<CalendarWidget />, { wrapper });
    expect(await screen.findByText('Ortsumgehung Nord')).toBeVisible();
    expect(screen.getByText('Auslegungsfrist')).toBeVisible();
    expect(screen.getByText('Einwendungsfrist')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('formats the selected-date heading using the active language', () => {
    const { rerender, container } = render(<CalendarWidget />, { wrapper });
    expect(container.querySelector('h4')).toHaveTextContent('März');
    language = 'en';
    rerender(<CalendarWidget />);
    expect(container.querySelector('h4')).toHaveTextContent('March');
  });
});
