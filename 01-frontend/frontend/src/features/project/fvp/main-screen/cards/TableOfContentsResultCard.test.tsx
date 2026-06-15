import { TooltipProvider } from '@/features/ui/tooltip/Tooltip';
import { cleanup, render, screen } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { TableOfContentsResultCard } from './TableOfContentsResultCard';

const { useDocumentsMock } = vi.hoisted(() => ({ useDocumentsMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock(
  '@/features/project/fvp/main-screen/data/read-model/useTableOfContentsDocuments',
  () => ({ useTableOfContentsDocuments: useDocumentsMock }),
);

// The card calls `route.useNavigate()` and `useCanMutateProject(...)` before its
// error early-return, so both need stubs that work without router/app context.
vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({ useNavigate: () => () => undefined }),
}));

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({ canMutateProject: true }),
  }),
);

const originalResizeObserver = globalThis.ResizeObserver;

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
});

beforeEach(() => useDocumentsMock.mockReset());

afterEach(() => cleanup());

const renderCard = () =>
  render(
    <TooltipProvider>
      <TableOfContentsResultCard projectId="p1" />
    </TooltipProvider>,
  );

describe('TableOfContentsResultCard error state', () => {
  it('renders a retryable error alert instead of misleading counts when the read fails', () => {
    useDocumentsMock.mockReturnValue({
      items: [],
      isLoading: false,
      isError: true,
    });

    renderCard();

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'common.errors.collection.retry' }),
    ).toBeTruthy();
    // The misleading "0 / 0 processed" progress summary must not render on failure.
    expect(
      screen.queryByText('redesign.tableOfContentsCard.status.progress'),
    ).toBeNull();
  });

  it('renders the normal summary when the read succeeds', () => {
    useDocumentsMock.mockReturnValue({
      items: [
        {
          id: 'a',
          name: 'Document A',
          isOnRequestList: false,
          isResolved: false,
        },
        {
          id: 'b',
          name: 'Document B',
          isOnRequestList: false,
          isResolved: true,
        },
      ],
      isLoading: false,
      isError: false,
    });

    renderCard();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByText('redesign.tableOfContentsCard.status.progress'),
    ).toBeTruthy();
    expect(screen.getByText('redesign.tableOfContentsCard.title')).toBeTruthy();
  });
});
