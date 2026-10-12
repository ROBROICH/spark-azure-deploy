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

import { RequiredDocumentsResultCard } from './RequiredDocumentsResultCard';

const { useHintsMock } = vi.hoisted(() => ({ useHintsMock: vi.fn() }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./useRequiredDocumentHints', () => ({
  useRequiredDocumentHints: useHintsMock,
}));

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

beforeEach(() => useHintsMock.mockReset());

afterEach(() => cleanup());

const renderCard = () =>
  render(
    <TooltipProvider>
      <RequiredDocumentsResultCard projectId="p1" />
    </TooltipProvider>,
  );

describe('RequiredDocumentsResultCard error state', () => {
  it('renders a retryable error alert instead of misleading counts when the read fails', () => {
    useHintsMock.mockReturnValue({
      hints: [],
      totalRequired: 0,
      processedCount: 0,
      openCount: 0,
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
      screen.queryByText('redesign.requiredDocumentsCard.status.progress'),
    ).toBeNull();
  });

  it('keeps the status addon visible when the read fails', () => {
    useHintsMock.mockReturnValue({
      hints: [],
      totalRequired: 0,
      processedCount: 0,
      openCount: 0,
      isLoading: false,
      isError: true,
    });

    render(
      <TooltipProvider>
        <RequiredDocumentsResultCard
          projectId="p1"
          statusAddon={<button type="button">failure chip</button>}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('button', { name: 'failure chip' })).toBeTruthy();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('renders the normal summary when the read succeeds', () => {
    useHintsMock.mockReturnValue({
      hints: [
        { id: 'a', name: 'Required A', status: 'open' },
        { id: 'b', name: 'Required B', status: 'irrelevant' },
      ],
      totalRequired: 2,
      processedCount: 1,
      openCount: 1,
      isLoading: false,
      isError: false,
    });

    renderCard();

    expect(screen.queryByRole('alert')).toBeNull();
    expect(
      screen.getByText('redesign.requiredDocumentsCard.status.progress'),
    ).toBeTruthy();
    expect(
      screen.getByText('redesign.requiredDocumentsCard.title'),
    ).toBeTruthy();
  });
});
