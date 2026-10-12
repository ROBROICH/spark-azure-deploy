import '@testing-library/jest-dom/vitest';
import type { DeadlineResponse } from '@/api-clients/backend';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DeadlinesCard } from './DeadlinesCard';

const deadline = {
  id: 'deadline-1',
  projectId: 'project-1',
  deadlineType: 'Einwendungsfrist',
  legalBasis: null,
  startAt: '2026-04-10',
  endAt: '2026-05-11',
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
} satisfies DeadlineResponse;

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'de' } }),
}));

vi.mock('@/i18n/dateLocale', () => ({ getDateLocale: () => undefined }));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

vi.mock(
  '@/features/project/overview-screen/data/collections/deadlines.collection',
  () => ({
    deadlinesCollection: {
      delete: (...args: unknown[]) => mocks.remove(...args),
    },
  }),
);

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({ canMutateProject: true }),
  }),
);

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'project-1' }),
    useSearch: () => ({ editDeadlineId: undefined }),
    useNavigate: () => vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: null, isError: false }),
  skipToken: Symbol('skipToken'),
}));

vi.mock('@tanstack/react-db', () => ({
  useLiveInfiniteQuery: () => ({
    data: [deadline],
    isLoading: false,
    isError: false,
    hasNextPage: false,
  }),
  eq: vi.fn(),
}));

const confirmDelete = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(
    screen.getByRole('button', { name: 'Deadlines.actionsMenu' }),
  );
  await user.click(
    await screen.findByRole('menuitem', { name: 'Deadlines.actions.delete' }),
  );
  await user.click(
    screen.getByRole('button', { name: 'Deadlines.deleteDialog.confirm' }),
  );
};

describe('DeadlinesCard delete flow', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('reports success only after the delete transaction persists', async () => {
    const user = userEvent.setup();
    let resolvePersist: () => void = () => {};
    const persisted = new Promise<void>((resolve) => {
      resolvePersist = resolve;
    });
    mocks.remove.mockReturnValue({ isPersisted: { promise: persisted } });

    render(<DeadlinesCard />);
    await confirmDelete(user);

    expect(mocks.remove).toHaveBeenCalledWith('deadline-1');
    expect(mocks.toastSuccess).not.toHaveBeenCalled();

    resolvePersist();
    await waitFor(() =>
      expect(mocks.toastSuccess).toHaveBeenCalledWith(
        'Deadlines.deleteSuccess',
      ),
    );
  });

  it('shows an error toast and no success when the delete fails', async () => {
    const user = userEvent.setup();
    // Reject lazily so the card attaches its handler in the same tick.
    mocks.remove.mockImplementation(() => ({
      isPersisted: { promise: Promise.reject(new Error('persist failed')) },
    }));

    render(<DeadlinesCard />);
    await confirmDelete(user);

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Deadlines.deleteError'),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it('shows an error toast when the row was already removed before the delete', async () => {
    const user = userEvent.setup();
    // `delete` throws synchronously when a refetch already dropped the key.
    mocks.remove.mockImplementation(() => {
      throw new Error('key not found');
    });

    render(<DeadlinesCard />);
    await confirmDelete(user);

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith('Deadlines.deleteError'),
    );
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });
});
