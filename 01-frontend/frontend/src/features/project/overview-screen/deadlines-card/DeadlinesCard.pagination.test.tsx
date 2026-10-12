import '@testing-library/jest-dom/vitest';
import { QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { client } from '@/api-clients/backend/client.gen';
import type { DeadlineResponse } from '@/api-clients/backend';
import type * as ReactI18next from 'react-i18next';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { DeadlinesCard } from './DeadlinesCard';

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactI18next>()),
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'de' } }),
}));
vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({ canMutateProject: true }),
  }),
);
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: '61000000-0000-4000-8000-000000000002' }),
    useSearch: () => ({
      editDeadlineId: '61000000-0000-4000-8000-000000000054',
    }),
    useNavigate: () => vi.fn(),
  }),
}));

const deadlines: DeadlineResponse[] = Array.from(
  { length: 55 },
  (_, index) => ({
    id: `61000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    projectId: '61000000-0000-4000-8000-000000000002',
    deadlineType: index === 54 ? 'Beyond first page' : `Review ${index}`,
    startAt: '2026-09-26',
    endAt: '2026-09-27',
    legalBasis: null,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
  }),
);

describe('deadline deep links', () => {
  it('opens the requested deadline even when it is outside the loaded list page', async () => {
    const original = client.getConfig();
    client.setConfig({
      baseUrl: 'http://deadlines.test',
      fetch: (request) => {
        const url = new URL(
          request instanceof Request ? request.url : String(request),
        );
        if (url.pathname.endsWith('/deadlines')) {
          const offset = Number(url.searchParams.get('offset') ?? 0);
          const limit = Number(url.searchParams.get('limit') ?? 50);
          return Promise.resolve(
            Response.json(deadlines.slice(offset, offset + limit)),
          );
        }
        const deadline = deadlines.find(({ id }) =>
          url.pathname.endsWith(`/deadlines/${id}`),
        );
        return Promise.resolve(
          deadline
            ? Response.json(deadline)
            : new Response(null, { status: 404 }),
        );
      },
    });
    try {
      render(
        <QueryClientProvider client={queryClient}>
          <DeadlinesCard />
        </QueryClientProvider>,
      );
      expect(
        await screen.findByDisplayValue('Beyond first page'),
      ).toBeVisible();
    } finally {
      cleanup();
      queryClient.clear();
      client.setConfig(original);
    }
  });
});
