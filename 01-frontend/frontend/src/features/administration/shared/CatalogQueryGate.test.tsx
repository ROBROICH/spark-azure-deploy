import '@testing-library/jest-dom/vitest';
import { attachHttpStatusToError } from '@/integrations/api-clients/httpErrorStatus';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Usecase } from '../data/usecaseApi';
import { CatalogQueryGate } from './CatalogQueryGate';

const mocks = vi.hoisted(() => ({
  getCatalogUsecase: vi.fn(),
}));

vi.mock('@/api-clients/backend/sdk.gen', () => ({}));

vi.mock('../data/usecaseApi', () => ({
  getCatalogUsecase: (...args: unknown[]) => mocks.getCatalogUsecase(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const usecase: Usecase = {
  slug: 'fernstrasse',
  projekttyp: {
    id: '00000000-0000-0000-0000-000000000000',
    name: 'Fernstraße',
  },
  gesetzesgrundlage: { topics: [], stateNormGroups: {}, topicStateGroups: {} },
  dokumente: { categories: [] },
  beschluss: { nodes: [] },
  updatedAt: '2026-08-20T10:00:00.000Z',
};

const renderGate = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = (props: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, props.children);

  return render(
    <CatalogQueryGate
      headingId="gate-heading"
      title="Gate title"
      projectTypeId={usecase.projekttyp.id}
      missing={<p>missing-catalog</p>}
    >
      {() => <p>ready-catalog</p>}
    </CatalogQueryGate>,
    { wrapper },
  );
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mocks.getCatalogUsecase.mockReset();
});

describe('CatalogQueryGate', () => {
  it('shows a loading status while the catalog query is pending', () => {
    mocks.getCatalogUsecase.mockReturnValue(new Promise(() => undefined));
    renderGate();

    expect(
      screen.getByRole('status', { name: 'catalog.loading' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Gate title' }),
    ).toBeInTheDocument();
  });

  it('shows a query error with retry', async () => {
    const user = userEvent.setup();
    mocks.getCatalogUsecase.mockRejectedValue(new Error('gate down'));
    renderGate();

    expect(await screen.findByRole('alert')).toHaveTextContent('gate down');
    await user.click(screen.getByRole('button', { name: 'catalog.retry' }));

    await waitFor(() => {
      expect(mocks.getCatalogUsecase).toHaveBeenCalledTimes(2);
    });
  });

  it('renders the missing slot when the catalog is absent', async () => {
    mocks.getCatalogUsecase.mockRejectedValue(
      attachHttpStatusToError(
        { message: 'not found' },
        new Response(null, { status: 404 }),
      ),
    );
    renderGate();

    expect(await screen.findByText('missing-catalog')).toBeInTheDocument();
  });

  it('renders children when the catalog is ready', async () => {
    mocks.getCatalogUsecase.mockResolvedValue({ data: usecase });
    renderGate();

    expect(await screen.findByText('ready-catalog')).toBeInTheDocument();
  });
});
