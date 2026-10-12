import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FvpCategoryState } from '@/features/project/fvp/data/useFvpCategoryData';
import { FvpScreen } from './FvpScreen';
import type { FvpAiWorkflowState } from './useFvpAiWorkflowState';

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

const baseProgress = {
  tableOfContents: makeProgress(),
  requiredDocuments: makeProgress(),
  plausibility: makeProgress(),
};

const baseWorkflow = {
  canShowDocuments: false,
  canStartProcess: false,
  disableThresholdPercentage: 500,
  isAiAnalysisRunning: false,
  isAiAnalysisComplete: false,
  isAiAnalysisIncomplete: false,
  isAiAnalysisDecisionLoading: false,
  isStartBlockedBySystemLoad: false,
  isStartButtonDisabled: true,
  isStartButtonLoading: false,
  shouldShowStartAction: true,
  startButtonDisabledReason: undefined,
  progress: baseProgress,
} satisfies FvpAiWorkflowState;

type RouteSearch = {
  isEditRequiredDocumentsDialogOpen: boolean | undefined;
  isStartFvpRunDialogOpen: boolean | undefined;
};

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useFvpAiWorkflowState: vi.fn(),
  search: {
    isEditRequiredDocumentsDialogOpen: false,
    isStartFvpRunDialogOpen: false,
  } as RouteSearch,
  canMutateProject: true,
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => mocks.navigate,
    useParams: () => ({ verfahrenId: 'project-1' }),
    // Mirror the real route API: apply the caller's `select` to the search
    // object so the page receives the narrowed shape it actually reads.
    useSearch: (
      {
        select,
      }: {
        select: (search: RouteSearch) => unknown;
      } = { select: (search) => search },
    ) => select(mocks.search),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('./useFvpAiWorkflowState', () => ({
  useFvpAiWorkflowState: mocks.useFvpAiWorkflowState,
}));

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({
      canMutateProject: mocks.canMutateProject,
    }),
  }),
);

vi.mock('./cards/AiAnalysisSection', () => ({
  // Surface the read-only guard and the wired start handler so tests can
  // assert whether the start action is reachable for the current user.
  AiAnalysisSection: (props: {
    canMutateProject?: boolean;
    onStartClick: () => void;
  }) => (
    <button
      type="button"
      data-testid="ai-analysis-start"
      disabled={props.canMutateProject === false}
      onClick={props.onStartClick}
    >
      ai analysis section
    </button>
  ),
}));

vi.mock('./cards/TableOfContentsResultCard', () => ({
  TableOfContentsResultCard: () => <div>toc result card</div>,
}));

vi.mock('./cards/PlausibilityResultCard', () => ({
  PlausibilityResultCard: () => <div>plausibility result card</div>,
}));

vi.mock('./cards/RequiredDocumentsResultCard', () => ({
  RequiredDocumentsResultCard: () => <div>required documents result card</div>,
}));

vi.mock('./documents-card/DocumentsCard', () => ({
  DocumentsCard: () => <div>documents card</div>,
}));

vi.mock('./required-documents-card/EditRequiredDocumentsDialog', () => ({
  EditRequiredDocumentsDialog: () => <div>edit required documents dialog</div>,
}));

vi.mock('./StartFvpRunDialog', () => ({
  // Render only when the page passes `open`, mirroring the real dialog so the
  // page-level `open` guard is observable as visible output.
  StartFvpRunDialog: (props: { open: boolean }) =>
    props.open ? <div>start fvp run dialog</div> : null,
}));

afterEach(() => {
  cleanup();
  mocks.navigate.mockClear();
  mocks.useFvpAiWorkflowState.mockReset();
  mocks.search = {
    isEditRequiredDocumentsDialogOpen: false,
    isStartFvpRunDialogOpen: false,
  };
  mocks.canMutateProject = true;
});

describe('FvpScreen', () => {
  it('renders the progressive AI analysis section', () => {
    mocks.useFvpAiWorkflowState.mockReturnValue(baseWorkflow);

    render(<FvpScreen />);

    expect(screen.getByText('ai analysis section')).toBeTruthy();
  });

  it('keeps the page on the primary background while the initial AI analysis decision is unresolved', () => {
    mocks.useFvpAiWorkflowState.mockReturnValue({
      ...baseWorkflow,
      isAiAnalysisDecisionLoading: true,
    } satisfies FvpAiWorkflowState);

    const { container } = render(<FvpScreen />);

    expect(screen.queryByText('ai analysis section')).toBeNull();
    expect(
      container.firstElementChild?.classList.contains('bg-bg-primary'),
    ).toBe(true);
  });

  it('renders the documents section once TOC and FCS data are ready', () => {
    mocks.useFvpAiWorkflowState.mockReturnValue({
      ...baseWorkflow,
      canShowDocuments: true,
    } satisfies FvpAiWorkflowState);

    render(<FvpScreen />);

    expect(screen.getByText('documents card')).toBeTruthy();
  });

  it('opens the start dialog route state without adding browser history', () => {
    mocks.useFvpAiWorkflowState.mockReturnValue({
      ...baseWorkflow,
      canStartProcess: true,
    } satisfies FvpAiWorkflowState);

    render(<FvpScreen />);

    screen.getByTestId('ai-analysis-start').click();

    expect(mocks.navigate).toHaveBeenCalledWith({
      search: expect.any(Function),
      replace: true,
      resetScroll: false,
    });
    const navigateArgs = mocks.navigate.mock.calls[0]?.[0] as {
      search: (search: RouteSearch) => RouteSearch;
    };
    expect(navigateArgs.search(mocks.search)).toEqual({
      isEditRequiredDocumentsDialogOpen: false,
      isStartFvpRunDialogOpen: true,
    });
  });

  it('keeps URL-opened edit and start dialogs closed and the start action unavailable for a read-only user', () => {
    mocks.canMutateProject = false;
    // Stale/deep-linked URL requesting both overlays open at once.
    mocks.search = {
      isEditRequiredDocumentsDialogOpen: true,
      isStartFvpRunDialogOpen: true,
    };
    mocks.useFvpAiWorkflowState.mockReturnValue({
      ...baseWorkflow,
      // Even with a "startable" workflow, the read-only guard must win.
      canStartProcess: true,
    } satisfies FvpAiWorkflowState);

    render(<FvpScreen />);

    // The page renders, but neither route-opened dialog is allowed open.
    expect(screen.getByTestId('ai-analysis-start')).toBeTruthy();
    expect(screen.queryByText('edit required documents dialog')).toBeNull();
    expect(screen.queryByText('start fvp run dialog')).toBeNull();

    // The start control is disabled and the start handler refuses to navigate,
    // so a read-only user cannot open the start dialog from the UI either.
    const startControl = screen.getByTestId('ai-analysis-start');
    expect(startControl).toHaveProperty('disabled', true);
    startControl.click();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('opens the URL-requested start dialog for a user who can mutate the project', () => {
    mocks.canMutateProject = true;
    mocks.search = {
      isEditRequiredDocumentsDialogOpen: false,
      isStartFvpRunDialogOpen: true,
    };
    mocks.useFvpAiWorkflowState.mockReturnValue(baseWorkflow);

    render(<FvpScreen />);

    expect(screen.getByText('start fvp run dialog')).toBeTruthy();
  });
});
