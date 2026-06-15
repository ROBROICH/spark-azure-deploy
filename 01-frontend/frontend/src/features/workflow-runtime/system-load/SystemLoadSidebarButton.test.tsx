import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { GetSystemLoadResponse } from '@/api-clients/temporal-jobs-module/types.gen';
import { SidebarProvider } from '@/features/ui/sidebar/Sidebar';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { SystemLoadSidebarButton } from './SystemLoadSidebarButton';

const systemLoadData: GetSystemLoadResponse = {
  load_percentage: 42,
  running_workflows: 12,
  current_complexity: 18,
  max_complexity: 30,
  breakdown: [
    {
      workflow_type: 'FVPWorkflow',
      running_count: 3,
      complexity_weight: 2,
      total_complexity: 6,
    },
  ],
};

type MockSystemLoadState = {
  data: GetSystemLoadResponse | undefined;
  isError: boolean;
  isFetching: boolean;
  isLoading: boolean;
  isSystemLoadHigh: boolean;
};

const mocks = vi.hoisted(() => ({
  isDevMode: false,
  refetchSystemLoad: vi.fn(),
  systemLoadState: {
    data: undefined,
    isError: false,
    isFetching: false,
    isLoading: false,
    isSystemLoadHigh: false,
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const values: Record<string, string> = {
        'sidebar.systemLoad.label': 'System load',
        'sidebar.systemLoad.buttonAria':
          'Refresh system load, currently {{load}}',
        'sidebar.systemLoad.title': 'System load',
        'sidebar.systemLoad.loading': 'Loading system load...',
        'sidebar.systemLoad.error': 'System load is unavailable.',
        'sidebar.systemLoad.unavailableValue': 'n/a',
        'sidebar.systemLoad.runningWorkflows': 'Workflows',
        'sidebar.systemLoad.currentComplexity': 'Current',
        'sidebar.systemLoad.maxComplexity': 'Maximum',
        'sidebar.systemLoad.breakdown': 'Breakdown',
        'sidebar.systemLoad.runningCount': 'Count',
        'sidebar.systemLoad.complexityWeight': 'Weight',
        'sidebar.systemLoad.totalComplexity': 'Total',
        'sidebar.systemLoad.noBreakdown': 'No running workflows',
      };

      return (values[key] ?? key).replace('{{load}}', params?.load ?? '');
    },
  }),
}));

vi.mock('./useSystemLoad', () => ({
  useSystemLoad: () => ({
    ...mocks.systemLoadState,
    refetch: mocks.refetchSystemLoad,
  }),
}));

vi.mock('@/features/dev-mode/useDevMode', () => ({
  useDevMode: () => [mocks.isDevMode, vi.fn()],
}));

beforeAll(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

function renderSystemLoadSidebarButton() {
  render(
    <SidebarProvider defaultOpen>
      <SystemLoadSidebarButton />
    </SidebarProvider>,
  );
}

function setSystemLoadState(state: Partial<MockSystemLoadState> = {}) {
  (mocks as { systemLoadState: MockSystemLoadState }).systemLoadState = {
    data: systemLoadData,
    isError: false,
    isFetching: false,
    isLoading: false,
    isSystemLoadHigh: false,
    ...state,
  };
}

function makeSystemLoadData(loadPercentage: number): GetSystemLoadResponse {
  return {
    ...systemLoadData,
    load_percentage: loadPercentage,
  };
}

async function openSystemLoadPopover(loadLabel: string) {
  const button = screen.getByRole('button', {
    name: `Refresh system load, currently ${loadLabel}`,
  });

  await userEvent.click(button);

  return button;
}

function getProgressBar() {
  return Array.from(document.querySelectorAll<HTMLElement>('[style]')).find(
    (element) => element.className.includes('transition-[width]'),
  );
}

describe('SystemLoadSidebarButton', () => {
  afterEach(() => {
    cleanup();
    mocks.isDevMode = false;
    mocks.refetchSystemLoad.mockClear();
    setSystemLoadState();
  });

  it('hides running workflow details outside dev mode', async () => {
    setSystemLoadState();
    renderSystemLoadSidebarButton();

    await openSystemLoadPopover('42%');

    expect(screen.getByText('Workflows')).toBeInTheDocument();
    expect(screen.getByText('Current')).toBeInTheDocument();
    expect(screen.getByText('Maximum')).toBeInTheDocument();
    expect(screen.queryByText('Breakdown')).not.toBeInTheDocument();
    expect(screen.queryByText('FVPWorkflow')).not.toBeInTheDocument();
  });

  it('shows running workflow details in dev mode', async () => {
    mocks.isDevMode = true;
    setSystemLoadState();

    renderSystemLoadSidebarButton();

    await openSystemLoadPopover('42%');

    const breakdownHeading = screen.getByText('Breakdown');
    const popoverContent = breakdownHeading.closest(
      '[data-slot="popover-content"]',
    );

    expect(screen.getByText('FVPWorkflow')).toBeInTheDocument();
    expect(popoverContent).toHaveClass(
      'max-h-(--radix-popper-available-height)',
    );
    expect(popoverContent).toHaveClass('overflow-y-auto');
  });

  it.each([
    {
      name: 'loading',
      state: { isFetching: true, isLoading: true },
      status: 'Loading system load...',
      isBusy: true,
    },
    {
      name: 'error',
      state: { isError: true },
      status: 'System load is unavailable.',
      isBusy: false,
    },
  ])(
    'renders the unavailable button label and popover status while $name',
    async ({ state, status, isBusy }) => {
      setSystemLoadState({ ...state, data: undefined });

      renderSystemLoadSidebarButton();

      const button = await openSystemLoadPopover('n/a');

      expect(button).toHaveAttribute('aria-busy', String(isBusy));
      expect(within(button).getByText('n/a')).toBeInTheDocument();
      expect(screen.getByText(status)).toBeInTheDocument();
      expect(screen.getAllByText('n/a')).toHaveLength(2);
    },
  );

  it('renders the unavailable value without a status message when no load data exists', async () => {
    setSystemLoadState({ data: undefined });

    renderSystemLoadSidebarButton();

    const button = await openSystemLoadPopover('n/a');

    expect(button).toHaveAttribute('aria-busy', 'false');
    expect(
      screen.queryByText('Loading system load...'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('System load is unavailable.'),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText('n/a')).toHaveLength(2);
  });

  it.each([
    {
      name: 'unknown load',
      data: undefined,
      label: 'n/a',
      indicatorClassName: 'bg-slate-500',
      textClassName: 'text-slate-300',
      progressWidth: '0%',
    },
    {
      name: 'normal load',
      data: makeSystemLoadData(42),
      label: '42%',
      indicatorClassName: 'bg-emerald-400',
      textClassName: 'text-emerald-200',
      progressWidth: '42%',
    },
    {
      name: 'warning threshold',
      data: makeSystemLoadData(60),
      label: '60%',
      indicatorClassName: 'bg-amber-300',
      textClassName: 'text-amber-200',
      progressWidth: '60%',
    },
    {
      name: 'critical threshold',
      data: makeSystemLoadData(80),
      label: '80%',
      indicatorClassName: 'bg-red-400',
      textClassName: 'text-red-200',
      progressWidth: '80%',
    },
    {
      name: 'over full load',
      data: makeSystemLoadData(125),
      label: '125%',
      indicatorClassName: 'bg-red-400',
      textClassName: 'text-red-200',
      progressWidth: '100%',
    },
  ])(
    'renders $name with the expected tone and progress width',
    async ({
      data,
      label,
      indicatorClassName,
      textClassName,
      progressWidth,
    }) => {
      setSystemLoadState({ data });

      renderSystemLoadSidebarButton();

      const button = await openSystemLoadPopover(label);

      expect(within(button).getByText(label)).toHaveClass(textClassName);
      expect(button.querySelector(`.${indicatorClassName}`)).not.toBeNull();
      expect(getProgressBar()).toHaveStyle({ width: progressWidth });
    },
  );
});
