import { TooltipProvider } from '@/features/ui/tooltip/Tooltip';
import { cleanup, render, screen, within } from '@testing-library/react';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { ReactNode } from 'react';
import type { FvpCategoryState } from '@/features/project/fvp/data/useFvpCategoryData';
import { AiAnalysisSection } from './AiAnalysisSection';

const testWorkflow = {
  workflowStartTime: null,
};

const makeProgress = (
  overrides: Partial<FvpCategoryState> = {},
): FvpCategoryState => {
  const status = overrides.status ?? 'idle';
  const isDone = overrides.isDone ?? status === 'ready';
  const isRunning = overrides.isRunning ?? status === 'running';
  const isLoading =
    overrides.isLoading ?? (status === 'loading' || status === 'running');

  return {
    status,
    data: null,
    failureCode: null,
    hasResult: isDone,
    hasReadError: false,
    isDone,
    isLoading,
    isRunning,
    workflow: testWorkflow,
    ...overrides,
  };
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number }) =>
      values?.count === undefined ? key : `${key}:${values.count}`,
  }),
}));

// The section now owns the task -> result-card mapping, so stub each card to a
// recognizable marker. A task slot only renders its card once every dependency
// workflow is done, so these markers stay absent while a slot is pending. Each
// stub renders its status slot so a failure badge on a result stays visible.
type ResultCardStubProps = { statusAddon?: ReactNode };
vi.mock('./TableOfContentsResultCard', () => ({
  TableOfContentsResultCard: (props: ResultCardStubProps) => (
    <div>tableOfContents result{props.statusAddon}</div>
  ),
}));
vi.mock('./RequiredDocumentsResultCard', () => ({
  RequiredDocumentsResultCard: (props: ResultCardStubProps) => (
    <div>required documents result{props.statusAddon}</div>
  ),
}));
vi.mock('./PlausibilityResultCard', () => ({
  PlausibilityResultCard: (props: ResultCardStubProps) => (
    <div>plausibility result{props.statusAddon}</div>
  ),
}));

const baseProgress = {
  tableOfContents: makeProgress(),
  requiredDocuments: makeProgress(),
  plausibility: makeProgress(),
};

const loadingProgress = {
  tableOfContents: makeProgress({ status: 'loading' }),
  requiredDocuments: makeProgress({ status: 'loading' }),
  plausibility: makeProgress({ status: 'loading' }),
};

const projectId = 'project-1';

const baseWorkflow = {
  disableThresholdPercentage: 500,
  isAiAnalysisComplete: false,
  isAiAnalysisIncomplete: false,
  isAiAnalysisRunning: false,
  isStartBlockedBySystemLoad: false,
  isStartButtonDisabled: false,
  isStartButtonLoading: false,
  shouldShowStartAction: true,
  startButtonDisabledReason: undefined,
  progress: baseProgress,
};

const renderWithTooltipProvider = (node: ReactNode) =>
  render(<TooltipProvider>{node}</TooltipProvider>);

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('AiAnalysisSection', () => {
  it('shows remaining-time estimates under progress bars only while running', () => {
    const now = new Date('2026-05-11T10:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const { rerender } = renderWithTooltipProvider(
      <AiAnalysisSection
        workflow={{
          ...baseWorkflow,
        }}
        projectId={projectId}
        onStartClick={() => undefined}
      />,
    );

    expect(
      screen.queryByText('redesign.aiAnalysis.progress.remainingTime.hours:1'),
    ).toBeNull();

    rerender(
      <AiAnalysisSection
        workflow={{
          ...baseWorkflow,
          isAiAnalysisRunning: true,
          progress: loadingProgress,
        }}
        projectId={projectId}
        onStartClick={() => undefined}
      />,
    );

    expect(
      screen.getAllByText('redesign.aiAnalysis.progress.remainingTime.hours:1'),
    ).toHaveLength(2);
    expect(
      screen.getByText('redesign.aiAnalysis.progress.remainingTime.hours:3'),
    ).toBeTruthy();
  });

  it('shows the system-load reason text only when high load disables the start button', () => {
    const { rerender } = renderWithTooltipProvider(
      <AiAnalysisSection
        workflow={{
          ...baseWorkflow,
          isStartButtonDisabled: true,
        }}
        projectId={projectId}
        onStartClick={() => undefined}
      />,
    );

    expect(
      screen.queryByText('projectNavbar.startProcessDisabledBySystemLoad'),
    ).toBeNull();

    rerender(
      <TooltipProvider>
        <AiAnalysisSection
          workflow={{
            ...baseWorkflow,
            isStartBlockedBySystemLoad: true,
            isStartButtonDisabled: true,
            startButtonDisabledReason: 'systemLoad',
          }}
          projectId={projectId}
          onStartClick={() => undefined}
        />
      </TooltipProvider>,
    );

    // The reason is now always-visible helper text (keyboard/SR reachable), not
    // a mouse-only tooltip.
    expect(
      screen.getByText('projectNavbar.startProcessDisabledBySystemLoad'),
    ).toBeTruthy();
  });

  it('shows the missing-documents reason text when no documents are available', () => {
    renderWithTooltipProvider(
      <AiAnalysisSection
        canMutateProject={false}
        workflow={{
          ...baseWorkflow,
          isStartButtonDisabled: true,
          startButtonDisabledReason: 'missingDocuments',
        }}
        projectId={projectId}
        onStartClick={() => undefined}
      />,
    );

    expect(
      screen.getByText('redesign.aiAnalysis.startDisabledNoDocumentsTooltip'),
    ).toBeTruthy();
  });

  it('keeps the table-of-contents result pending until the required-documents workflow is done', () => {
    const now = new Date('2026-05-11T10:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderWithTooltipProvider(
      <AiAnalysisSection
        workflow={{
          ...baseWorkflow,
          isAiAnalysisRunning: true,
          progress: {
            tableOfContents: makeProgress({ status: 'ready' }),
            requiredDocuments: makeProgress({ status: 'loading' }),
            plausibility: makeProgress(),
          },
        }}
        projectId={projectId}
        onStartClick={() => undefined}
      />,
    );

    expect(screen.queryByText('tableOfContents result')).toBeNull();
    expect(
      screen.getAllByText('redesign.aiAnalysis.progress.remainingTime.hours:1'),
    ).toHaveLength(2);
    expect(
      screen.queryByText('redesign.aiAnalysis.progress.remainingTime.hours:3'),
    ).toBeNull();
  });

  it('renders result cards when all task progress gates are done', () => {
    renderWithTooltipProvider(
      <AiAnalysisSection
        workflow={{
          ...baseWorkflow,
          isAiAnalysisComplete: true,
          progress: {
            tableOfContents: makeProgress({ status: 'ready' }),
            requiredDocuments: makeProgress({ status: 'ready' }),
            plausibility: makeProgress({ status: 'ready' }),
          },
        }}
        projectId={projectId}
        onStartClick={() => undefined}
      />,
    );

    expect(screen.getByText('tableOfContents result')).toBeTruthy();
    expect(screen.getByText('required documents result')).toBeTruthy();
    expect(screen.getByText('plausibility result')).toBeTruthy();
    expect(screen.queryByText('redesign.aiAnalysis.description')).toBeNull();
  });

  it('hides the start action when project versions auto-start workflows', () => {
    renderWithTooltipProvider(
      <AiAnalysisSection
        workflow={{
          ...baseWorkflow,
          shouldShowStartAction: false,
        }}
        projectId={projectId}
        onStartClick={() => undefined}
      />,
    );

    expect(screen.queryByText('redesign.aiAnalysis.startButton')).toBeNull();
  });

  it('announces only the start and completion of the AI analysis via a live region', () => {
    const { rerender } = renderWithTooltipProvider(
      <AiAnalysisSection
        workflow={{ ...baseWorkflow }}
        projectId={projectId}
        onStartClick={() => undefined}
      />,
    );

    // Nothing is announced before a run starts.
    expect(screen.getByRole('status').textContent).toBe('');

    rerender(
      <TooltipProvider>
        <AiAnalysisSection
          workflow={{
            ...baseWorkflow,
            isAiAnalysisRunning: true,
            progress: loadingProgress,
          }}
          projectId={projectId}
          onStartClick={() => undefined}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('status').textContent).toBe(
      'redesign.aiAnalysis.announcer.started',
    );

    rerender(
      <TooltipProvider>
        <AiAnalysisSection
          workflow={{ ...baseWorkflow }}
          projectId={projectId}
          onStartClick={() => undefined}
        />
      </TooltipProvider>,
    );

    expect(screen.getByRole('status').textContent).toBe(
      'redesign.aiAnalysis.announcer.completed',
    );
  });

  it('keeps the required-documents card pending until the table-of-contents workflow is done', () => {
    const now = new Date('2026-05-11T10:00:00.000Z').getTime();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    renderWithTooltipProvider(
      <AiAnalysisSection
        workflow={{
          ...baseWorkflow,
          isAiAnalysisRunning: true,
          progress: {
            tableOfContents: makeProgress({ status: 'loading' }),
            requiredDocuments: makeProgress({ status: 'ready' }),
            plausibility: makeProgress(),
          },
        }}
        projectId={projectId}
        onStartClick={() => undefined}
      />,
    );

    expect(screen.queryByText('required documents result')).toBeNull();
    expect(
      screen.getByText('redesign.aiAnalysis.cards.requiredDocuments.title'),
    ).toBeTruthy();
    expect(
      screen.getAllByText('redesign.aiAnalysis.progress.remainingTime.hours:1'),
    ).toHaveLength(2);
  });

  describe('failed categories', () => {
    it('marks the empty task card as failed when a category failed without a result', () => {
      renderWithTooltipProvider(
        <AiAnalysisSection
          workflow={{
            ...baseWorkflow,
            isAiAnalysisIncomplete: true,
            progress: {
              ...baseProgress,
              tableOfContents: makeProgress({
                status: 'failed',
                failureCode: 'ANALYSIS_TIMED_OUT',
              }),
            },
          }}
          projectId={projectId}
          onStartClick={() => undefined}
        />,
      );

      expect(
        screen.getByRole('button', {
          name: 'processingFailure.areas.tableOfContents',
        }),
      ).toBeTruthy();
      expect(
        screen.getByText('redesign.aiAnalysis.cards.tableOfContents.title'),
      ).toBeTruthy();
      expect(screen.queryByText('tableOfContents result')).toBeNull();
    });

    it('keeps a succeeded category result and marks the analysis incomplete when another failed', () => {
      renderWithTooltipProvider(
        <AiAnalysisSection
          workflow={{
            ...baseWorkflow,
            isAiAnalysisIncomplete: true,
            progress: {
              tableOfContents: makeProgress({
                status: 'failed',
                failureCode: 'ANALYSIS_FAILED',
              }),
              requiredDocuments: makeProgress({ status: 'ready' }),
              plausibility: makeProgress({ status: 'ready' }),
            },
          }}
          projectId={projectId}
          onStartClick={() => undefined}
        />,
      );

      expect(screen.getByText('required documents result')).toBeTruthy();
      expect(screen.getByText('plausibility result')).toBeTruthy();
      expect(screen.getByText('redesign.aiAnalysis.incomplete')).toBeTruthy();
    });

    it('marks an earlier result as failed and keeps that result visible', () => {
      renderWithTooltipProvider(
        <AiAnalysisSection
          workflow={{
            ...baseWorkflow,
            isAiAnalysisIncomplete: true,
            progress: {
              ...baseProgress,
              plausibility: makeProgress({
                status: 'failed',
                failureCode: 'ANALYSIS_FAILED',
                hasResult: true,
              }),
            },
          }}
          projectId={projectId}
          onStartClick={() => undefined}
        />,
      );

      const earlierResult = screen.getByText('plausibility result');
      expect(
        within(earlierResult).getByRole('button', {
          name: 'processingFailure.areas.plausibility',
        }),
      ).toBeTruthy();
    });

    it('shows the result card with the failure badge when the result read of a failed category failed', () => {
      renderWithTooltipProvider(
        <AiAnalysisSection
          workflow={{
            ...baseWorkflow,
            isAiAnalysisIncomplete: true,
            progress: {
              ...baseProgress,
              tableOfContents: makeProgress({
                status: 'failed',
                failureCode: 'ANALYSIS_FAILED',
                hasReadError: true,
              }),
            },
          }}
          projectId={projectId}
          onStartClick={() => undefined}
        />,
      );

      const resultCard = screen.getByText('tableOfContents result');
      expect(
        within(resultCard).getByRole('button', {
          name: 'processingFailure.areas.tableOfContents',
        }),
      ).toBeTruthy();
      expect(
        screen.queryByText('redesign.aiAnalysis.cards.tableOfContents.title'),
      ).toBeNull();
    });
  });
});
