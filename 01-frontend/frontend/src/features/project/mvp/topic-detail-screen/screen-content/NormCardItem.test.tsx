import type { CompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import type * as TanstackReactQuery from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TopicNormEntry } from '../screen-data/useRechtsgrundlageData.helpers';
import { getFirstNavigateSearch } from '@/features/project/test/projectUiTestMocks';
import { MvpSelectionLabelsProvider } from './MvpSelectionLabelsContext';
import { NormCardItem } from './NormCardItem';

const {
  mutateMock,
  navigateMock,
  observeStartedWorkflowMock,
  useDescendantNodesMock,
  useDescendantsMock,
  useRunningWorkflowMock,
  toastMock,
} = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  navigateMock: vi.fn(),
  observeStartedWorkflowMock: vi.fn(),
  useDescendantNodesMock: vi.fn(),
  useDescendantsMock: vi.fn(),
  useRunningWorkflowMock: vi.fn(),
  toastMock: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}));

let isWorkflowRunning = false;
let hasFilteredFundstelleBadge = true;
let mutationIsPending = false;
let routeSearch: {
  selectedNormId?: string;
} = {};

const topicNorm = {
  id: 'topic-norm-1',
  node_type: 'topic_norm',
  compositeKey: 'topic_norm:topic-norm-1' as CompositeKey,
  project_id: 'verfahren-1',
  is_deleted: false,
  is_outdated: false,
  frontend_parent_ids: ['topic:topic-1'],
  project_version: 1,
  update_type: 'manual',
  created_at: '2026-04-09T00:00:00.000Z',
  updated_at: '2026-04-09T00:00:00.000Z',
  jurabk: 'BNatSchG',
  paragraph_nr: '44',
  satz: null,
  absatz: null,
  nummer: null,
  mvp_status: 'unchecked',
  satz_statuses: {},
  sys_period: null,
  topic_id: 'topic-1',
  type: 'pruefung',
} satisfies NodePayloadByType<'topic_norm'>;

const normNode = {
  id: 'norm-1',
  node_type: 'norm',
  compositeKey: 'norm:norm-1' as CompositeKey,
  project_id: 'verfahren-1',
  is_deleted: false,
  is_outdated: false,
  frontend_parent_ids: ['topic_norm:topic-norm-1'],
  project_version: 1,
  update_type: 'manual',
  created_at: '2026-04-09T00:00:00.000Z',
  updated_at: '2026-04-09T00:00:00.000Z',
  gesetz_id: 'gesetz-1',
  paragraph_nr: '44',
  paragraph_titel: 'Besonderer Artenschutz',
  regelungsgegenstand: null,
  sys_period: null,
  text: 'Norm text',
} satisfies NodePayloadByType<'norm'>;

const lightweightTopicNormEntry = {
  gesetz: null,
  norm: null,
  topicNorm,
} satisfies TopicNormEntry;

const resolvedTopicNormEntry = {
  gesetz: null,
  norm: normNode,
  topicNorm,
} satisfies TopicNormEntry;

const materialNormSourceRef = {
  type: 'materialNorm',
  itemId: 'norm-1',
} as const;

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: toastMock,
}));

vi.mock(
  '@/features/workflow-runtime/workflow-status/useRunningWorkflow',
  () => ({
    useRunningWorkflow: useRunningWorkflowMock,
    WORKFLOW_TYPE_BEWERTUNG: 'bewertung',
    WORKFLOW_TYPE_SUZ_NORM: 'suche_zuordnung_norm',
  }),
);

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof TanstackReactQuery>();

  return {
    ...actual,
    useMutation: () => ({
      isPending: mutationIsPending,
      mutate: mutateMock,
    }),
  };
});

vi.mock(
  '@/api-clients/agent-orchestration-module/@tanstack/react-query.gen',
  () => ({
    startSuzNormWorkflowWorkflowsSuzNormIdPostMutation: () => ({}),
  }),
);

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({
      topicName: 'topic-1',
      verfahrenId: 'verfahren-1',
    }),
    useSearch: (options?: {
      select?: (search: typeof routeSearch) => unknown;
    }) => (options?.select ? options.select(routeSearch) : routeSearch),
    useNavigate: () => navigateMock,
  }),
}));

vi.mock('./useFundstellenBadgePresence', () => ({
  useFundstellenBadgePresence: () => hasFilteredFundstelleBadge,
}));

vi.mock('@/features/project/law-changes/ui/LawChangeIndicator', async () => {
  const { createLawChangeIndicatorViewMock } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    LawChangeIndicatorView: createLawChangeIndicatorViewMock('law-change-1'),
  };
});

vi.mock('@/db/nodes/hooks/useDescendantNodes', () => ({
  useDescendantNodes: useDescendantNodesMock,
}));

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: useDescendantsMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations = {
        'NormCardItem.aiSupportDescription':
          'This norm has AI supported references',
        'NormCardItem.aiSupportDescriptionForDocument':
          'The selected document Document.pdf contains AI references for this norm.',
        'NormCardItem.aiSupportLabel': 'AI support',
        'NormCardItem.geprueft': 'Checked',
        'NormCardItem.manualNormTooltip': 'This norm was added manually',
        'NormCardItem.moreActions': 'More actions',
        'NormCardItem.nachfordern': 'Request more',
        'NormCardItem.addComment': 'Add comment',
        'NormCardItem.normEntfernen': 'Remove norm',
        'NormCardItem.normTextAnzeigen': 'Show norm text',
        'NormCardItem.pruefen': 'Review',
        'NormCardItem.erneutPruefen': 'Review again',
        'NormCardItem.startAiAnalysis': 'Start AI',
        'NormCardItem.startAiAnalysisLoading': 'AI running',
        'NormCardItem.updateAiAnalysis': 'Update',
        'NormCardItem.loadingTooltip':
          'This norm is currently being loaded by AI.',
        'NormCardItem.normSelectionAriaLabel': 'Select norm card',
        'NormCardItem.startAiAnalysisMissingTbmTooltip':
          'This norm has no legal criteria.',
        'NormCardItem.startAiAnalysisError':
          'The AI analysis could not be started.',
      } satisfies Record<string, string>;

      if (key in translations) {
        return translations[key as keyof typeof translations];
      }

      return key;
    },
  }),
}));

vi.mock('@/features/ui/cards/ai-norm-card/AiNormCard', () => ({
  AiNormCard: (props: {
    aiAction?: {
      disabledTooltip?: string;
      isDisabled?: boolean;
      label: string;
      status: string;
      tooltip?: ReactNode;
      onClick?: () => void;
    };
    className?: string;
    headerIcons?: ReactNode;
    menu?: ReactNode;
    reviewAction: {
      checkedLabel: string;
      disabled?: boolean;
      recheckLabel: string;
      status: string;
      uncheckedLabel: string;
      onClick?: () => void;
    };
    selection?: {
      ariaLabel: string;
      isSelected?: boolean;
      onSelect: () => void;
    };
    title: ReactNode;
    variant?: string;
  }) => {
    const aiAction = props.aiAction;
    const reviewLabel =
      props.reviewAction.status === 'checked'
        ? props.reviewAction.checkedLabel
        : props.reviewAction.status === 'recheck'
          ? props.reviewAction.recheckLabel
          : props.reviewAction.uncheckedLabel;

    return (
      <div
        data-testid="norm-card"
        data-variant={props.variant}
        className={[
          props.selection?.isSelected ? 'ring-2' : undefined,
          props.className,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {props.selection ? (
          <button
            type="button"
            aria-label={props.selection.ariaLabel}
            aria-pressed={props.selection.isSelected}
            onClick={props.selection.onSelect}
          />
        ) : null}
        {aiAction?.status === 'current' ? (
          <span
            data-testid="ai-icon"
            data-tooltip={
              aiAction.tooltip === undefined
                ? undefined
                : String(aiAction.tooltip)
            }
          >
            AI
          </span>
        ) : null}
        {aiAction && !['none', 'current'].includes(aiAction.status) ? (
          <button
            type="button"
            disabled={aiAction.isDisabled || aiAction.status === 'loading'}
            aria-busy={aiAction.status === 'loading'}
            data-disabled-tooltip={aiAction.disabledTooltip}
            data-tooltip={
              aiAction.tooltip === undefined
                ? undefined
                : String(aiAction.tooltip)
            }
            onClick={aiAction.onClick}
          >
            {aiAction.label}
          </button>
        ) : null}
        <div>{props.title}</div>
        {props.headerIcons}
        {props.menu}
        <button
          type="button"
          disabled={props.reviewAction.disabled}
          onClick={props.reviewAction.onClick}
        >
          {reviewLabel}
        </button>
      </div>
    );
  },
}));

vi.mock('@/features/ui/action-menu/ActionMenu', async () => {
  const { createActionMenuMock } =
    await import('@/features/project/test/projectUiTestMocks');

  return createActionMenuMock();
});

vi.mock('@/features/ui/ai/AiButton', () => ({
  AiButton: (
    props: React.ButtonHTMLAttributes<HTMLButtonElement> & {
      isDisabled?: boolean;
      isLoading?: boolean;
      label: string;
      disabledTooltip?: string;
      enabledTooltip?: string;
      size?: string;
    },
  ) => {
    const {
      isDisabled = false,
      isLoading = false,
      label,
      disabledTooltip,
      enabledTooltip: _enabledTooltip,
      size: _size,
      ...buttonProps
    } = props;

    return (
      <button
        disabled={isDisabled}
        aria-busy={isLoading}
        data-disabled-tooltip={disabledTooltip}
        {...buttonProps}
      >
        {label}
      </button>
    );
  },
}));

vi.mock('@/features/ui/ai/AiStatusChip', () => ({
  AiStatusChip: () => <span data-testid="ai-icon">AI</span>,
}));

vi.mock('@/features/ui/skeleton/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@/features/ui/button/SplitButton', () => ({
  SplitButton: (props: { checked: boolean; onCheckedChange: () => void }) => (
    <button type="button" onClick={props.onCheckedChange}>
      {props.checked ? 'Checked' : 'Review'}
    </button>
  ),
}));

const renderNormCardItem = (
  props: Partial<ComponentProps<typeof NormCardItem>> = {},
  options: { selectedDocumentLabel?: string | null } = {},
) => {
  const defaultProps = {
    canMutateTopic: true,
    lawChanges: [],
    normIdsWithFundstellen: new Set<string>(),
    removingNormId: null,
    norm: resolvedTopicNormEntry,
    onRemove: vi.fn(),
    onSelectNorm: vi.fn(),
    onToggleReviewed: vi.fn(),
  } satisfies ComponentProps<typeof NormCardItem>;

  return render(
    <MvpSelectionLabelsProvider
      selectedDocumentLabel={options.selectedDocumentLabel ?? null}
    >
      <NormCardItem {...defaultProps} {...props} />
    </MvpSelectionLabelsProvider>,
  );
};

const expectAiActionButtonState = (
  name: string,
  expected: { ariaBusy: 'false' | 'true'; disabled: boolean },
) => {
  const button = screen.getByRole('button', { name });

  expect(button.getAttribute('aria-busy')).toBe(expected.ariaBusy);
  expect(button.hasAttribute('disabled')).toBe(expected.disabled);

  return button;
};

const expectNoAiActionButtons = (...names: string[]) => {
  for (const name of names) {
    expect(screen.queryByRole('button', { name })).toBeNull();
  }
};

const expectMaterialNormSidebarSearch = <TExpectedSearch extends object>(
  expectedSearch: TExpectedSearch,
) => {
  const { navigateOptions, nextSearch } = getFirstNavigateSearch<
    { topicName: string },
    { topicName: string } & TExpectedSearch
  >(navigateMock, { topicName: 'topic-1' });

  expect(nextSearch).toEqual({
    topicName: 'topic-1',
    ...expectedSearch,
  });
  expect(navigateOptions.replace).toBe(true);
  expect(navigateOptions.resetScroll).toBe(false);
};

describe('NormCardItem', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    isWorkflowRunning = false;
    hasFilteredFundstelleBadge = true;
    mutationIsPending = false;
    routeSearch = {};
    mutateMock.mockReset();
    navigateMock.mockReset();
    observeStartedWorkflowMock.mockReset();
    navigateMock.mockReset();
    useDescendantNodesMock.mockReset();
    useDescendantsMock.mockReset();
    useDescendantsMock.mockReturnValue([
      { id: 'tbm-1', node_type: 'atomares_tbm' },
    ]);
    useRunningWorkflowMock.mockReset();
    useRunningWorkflowMock.mockImplementation(() => ({
      isRunning: isWorkflowRunning,
      observeStarted: observeStartedWorkflowMock,
    }));
    toastMock.error.mockReset();
  });

  it('shows the square AI icon when current fundstellen already exist', () => {
    renderNormCardItem({
      normIdsWithFundstellen: new Set([normNode.id]),
    });

    expect(useDescendantNodesMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Start AI' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    expect(screen.getByTestId('ai-icon').getAttribute('data-tooltip')).toBe(
      'This norm has AI supported references',
    );
  });

  it('does not put the referenced tooltip on the AI start button', () => {
    hasFilteredFundstelleBadge = false;

    renderNormCardItem();

    expect(
      screen
        .getByRole('button', { name: 'Start AI' })
        .getAttribute('data-tooltip'),
    ).toBeNull();
    expect(screen.queryByTestId('ai-icon')).toBeNull();
  });

  it('uses the selected document tooltip only when that document has fundstellen for this norm', () => {
    renderNormCardItem(
      {
        normIdsWithFundstellen: new Set([normNode.id]),
      },
      {
        selectedDocumentLabel: 'Document.pdf',
      },
    );

    expect(screen.getByTestId('ai-icon').getAttribute('data-tooltip')).toBe(
      'The selected document Document.pdf contains AI references for this norm.',
    );
  });

  it('keeps the generic current tooltip when the selected document has no fundstellen for this norm', () => {
    hasFilteredFundstelleBadge = false;

    renderNormCardItem(
      {
        normIdsWithFundstellen: new Set([normNode.id]),
      },
      {
        selectedDocumentLabel: 'Document.pdf',
      },
    );

    expect(screen.getByTestId('ai-icon').getAttribute('data-tooltip')).toBe(
      'This norm has AI supported references',
    );
  });

  it('renders the card title from the resolved norm paragraph number and title', () => {
    renderNormCardItem({
      norm: {
        ...resolvedTopicNormEntry,
        norm: {
          ...normNode,
          paragraph_nr: '45',
        },
        topicNorm: {
          ...topicNorm,
          paragraph_nr: '44',
        },
      },
    });

    expect(screen.getByText('§ 45 Besonderer Artenschutz')).not.toBeNull();
    expect(screen.queryByText('§ 44 Besonderer Artenschutz')).toBeNull();
  });

  it('passes the law change indicator through the AiNormCard header icon slot', async () => {
    renderNormCardItem();

    await userEvent.click(screen.getByTestId('law-change-indicator'));

    expect(navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      replace: true,
      resetScroll: false,
    });
    const { nextSearch } = getFirstNavigateSearch<
      { existing: string },
      { existing: string; lawChangeId: string }
    >(navigateMock, {
      existing: 'value',
    });
    expect(nextSearch).toEqual({
      existing: 'value',
      lawChangeId: 'law-change-1',
    });
  });

  it('shows the manual norm badge before the law change indicator for manually added topic norms', () => {
    renderNormCardItem();

    const manualBadge = screen.getByRole('img', {
      name: 'This norm was added manually',
    });
    const lawChangeIndicator = screen.getByTestId('law-change-indicator');

    expect(
      manualBadge.compareDocumentPosition(lawChangeIndicator) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).not.toBe(0);
  });

  it('does not show the manual norm badge for automated topic norms', () => {
    renderNormCardItem({
      norm: {
        ...resolvedTopicNormEntry,
        topicNorm: {
          ...topicNorm,
          update_type: 'automated',
        },
      },
    });

    expect(screen.queryByLabelText('This norm was added manually')).toBeNull();
  });

  it('does not show the manual norm badge for topic norms without an update type', () => {
    renderNormCardItem({
      norm: {
        ...resolvedTopicNormEntry,
        topicNorm: {
          ...topicNorm,
          update_type: null,
        },
      },
    });

    expect(screen.queryByLabelText('This norm was added manually')).toBeNull();
  });

  it('shows the update action when fundstellen exist but are outdated', async () => {
    useDescendantsMock.mockImplementation((nodeType) =>
      nodeType === 'fundstelle'
        ? [{ id: 'fundstelle-1', node_type: 'fundstelle', is_outdated: true }]
        : [{ id: 'tbm-1', node_type: 'atomares_tbm' }],
    );
    mutateMock.mockImplementation((_variables, callbacks) => {
      callbacks?.onSuccess?.({ parentJobId: 'suz-workflow-norm-1' });
    });

    renderNormCardItem({
      normIdsWithFundstellen: new Set([normNode.id]),
    });

    expect(screen.queryByRole('button', { name: 'Start AI' })).toBeNull();
    expect(screen.queryByTestId('ai-icon')).toBeNull();
    expect(screen.getByTestId('norm-card').getAttribute('data-variant')).toBe(
      'default',
    );

    const button = screen.getByRole('button', { name: 'Update' });
    expect(button.getAttribute('aria-busy')).toBe('false');
    expect(button.getAttribute('data-tooltip')).toBeNull();

    await userEvent.click(button);

    expect(mutateMock).toHaveBeenCalledOnce();
    expect(observeStartedWorkflowMock).toHaveBeenCalledTimes(1);
  });

  it('disables the AI start button when the norm graph has no atomare TBM descendants', async () => {
    useDescendantsMock.mockReturnValue([]);

    renderNormCardItem();

    const button = expectAiActionButtonState('Start AI', {
      ariaBusy: 'false',
      disabled: true,
    });
    expect(useDescendantsMock).toHaveBeenCalledWith('atomares_tbm', {
      id: 'norm-1',
      node_type: 'norm',
    });
    expect(button.getAttribute('data-disabled-tooltip')).toBe(
      'This norm has no legal criteria.',
    );
    expect(useRunningWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
      }),
    );

    await userEvent.click(button);

    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('shows the AI start button when no fundstellen data exists', () => {
    renderNormCardItem();

    expect(screen.getByRole('button', { name: 'Start AI' })).not.toBeNull();
    expectNoAiActionButtons('AI running', 'Update');
  });

  it('does not show a loading indicator without atomare TBM descendants', () => {
    isWorkflowRunning = true;
    useDescendantsMock.mockReturnValue([]);

    renderNormCardItem();

    expect(screen.queryByTestId('skeleton')).toBeNull();

    expectAiActionButtonState('Start AI', {
      ariaBusy: 'false',
      disabled: true,
    });
  });

  it('shows the AI start button as loading while the workflow is running', () => {
    isWorkflowRunning = true;

    renderNormCardItem();

    expectAiActionButtonState('AI running', {
      ariaBusy: 'true',
      disabled: true,
    });
    expectNoAiActionButtons('Start AI', 'Update');
  });

  it('shows a loading action instead of update while outdated fundstellen refresh', () => {
    isWorkflowRunning = true;
    useDescendantsMock.mockImplementation((nodeType) =>
      nodeType === 'fundstelle'
        ? [{ id: 'fundstelle-1', node_type: 'fundstelle', is_outdated: true }]
        : [{ id: 'tbm-1', node_type: 'atomares_tbm' }],
    );

    renderNormCardItem({
      normIdsWithFundstellen: new Set([normNode.id]),
    });

    expectAiActionButtonState('AI running', {
      ariaBusy: 'true',
      disabled: true,
    });
    expectNoAiActionButtons('Update');
  });

  it('disables the AI start button while a Bewertung workflow is running for the same norm', () => {
    useRunningWorkflowMock.mockImplementation((options) => ({
      isRunning:
        options.workflowType === 'bewertung' ? true : isWorkflowRunning,
      observeStarted: observeStartedWorkflowMock,
    }));

    renderNormCardItem();

    expectAiActionButtonState('AI running', {
      ariaBusy: 'true',
      disabled: true,
    });
    expect(useRunningWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
        workflowType: 'bewertung',
      }),
    );
  });

  it('renders a skeleton while the linked norm payload is still unresolved', () => {
    renderNormCardItem({
      norm: lightweightTopicNormEntry,
    });

    expect(screen.getByRole('status').getAttribute('aria-label')).toBe(
      'This norm is currently being loaded by AI.',
    );
    expect(screen.getAllByTestId('skeleton')).toHaveLength(5);
    expect(screen.queryByRole('button', { name: 'Review' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start AI' })).toBeNull();
  });

  it('tracks the SUZ workflow by norm id within the current project scope', () => {
    renderNormCardItem();

    expect(useRunningWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
        workflowType: 'suche_zuordnung_norm',
      }),
    );
  });

  it('starts the SUZ workflow and observes the started Temporal workflow', async () => {
    mutateMock.mockImplementation((_variables, callbacks) => {
      callbacks?.onSuccess?.({ parentJobId: 'suz-workflow-norm-1' });
    });

    renderNormCardItem();

    await userEvent.click(screen.getByRole('button', { name: 'Start AI' }));

    expect(mutateMock).toHaveBeenCalledWith(
      {
        body: {
          projectId: 'verfahren-1',
        },
        path: {
          norm_id: 'norm-1',
        },
      },
      expect.objectContaining({
        onError: expect.any(Function),
        onSuccess: expect.any(Function),
      }),
    );
    expect(observeStartedWorkflowMock).toHaveBeenCalledWith(
      'suz-workflow-norm-1',
    );
  });

  it('does not start the SUZ workflow without topic mutation rights', async () => {
    renderNormCardItem({ canMutateTopic: false });

    const button = screen.getByRole('button', { name: 'Start AI' });
    expect(button.hasAttribute('disabled')).toBe(true);

    await userEvent.click(button);

    expect(mutateMock).not.toHaveBeenCalled();
  });

  it('disables destructive remove action without topic mutation rights', () => {
    const onRemove = vi.fn();
    renderNormCardItem({ canMutateTopic: false, onRemove });

    const removeButton = screen.getByRole('button', { name: 'Remove norm' });
    expect(removeButton.hasAttribute('disabled')).toBe(true);
    fireEvent.click(removeButton);

    expect(onRemove).not.toHaveBeenCalled();
  });

  it('shows a toast error when the SUZ workflow fails to start', async () => {
    mutateMock.mockImplementation((_variables, callbacks) => {
      callbacks?.onError?.();
    });

    renderNormCardItem();

    await userEvent.click(screen.getByRole('button', { name: 'Start AI' }));

    expect(toastMock.error).toHaveBeenCalledWith(
      'The AI analysis could not be started.',
    );
  });

  it('selects the norm through the card-level primary action button', () => {
    const onSelectNorm = vi.fn();
    renderNormCardItem({ onSelectNorm });

    const selectButton = screen.getByRole('button', {
      name: 'Select norm card',
    });
    fireEvent.click(selectButton);

    expect(onSelectNorm).toHaveBeenCalledWith('norm-1');
  });

  it('uses the selected norm id from the lane owner for pressed styling', () => {
    renderNormCardItem({ selectedNormId: 'norm-1' });

    const card = screen.getByTestId('norm-card');
    const selectButton = screen.getByRole('button', {
      name: 'Select norm card',
    });

    expect(selectButton.getAttribute('aria-pressed')).toBe('true');
    expect(card.className).toContain('ring-2');
  });

  it('uses the match variant for contextual fundstellen filter highlighting', () => {
    renderNormCardItem({ selectedNormId: 'norm-1' });

    const card = screen.getByTestId('norm-card');

    expect(card.getAttribute('data-variant')).toBe('match');
  });

  it('keeps auxiliary actions separate from the card-level selection action', async () => {
    const user = userEvent.setup();
    const onSelectNorm = vi.fn();
    const onToggleReviewed = vi.fn();
    renderNormCardItem({ onSelectNorm, onToggleReviewed });

    await user.click(screen.getByRole('button', { name: 'Review' }));
    await user.click(screen.getByRole('button', { name: 'More actions' }));

    expect(onToggleReviewed).toHaveBeenCalledOnce();
    expect(onSelectNorm).not.toHaveBeenCalled();
  });

  it('keeps reviewed cards on the green success styling even when a match highlight is present', () => {
    renderNormCardItem({
      norm: {
        ...resolvedTopicNormEntry,
        topicNorm: {
          ...topicNorm,
          mvp_status: 'checked',
        },
      },
    });

    const card = screen.getByTestId('norm-card');

    expect(card.getAttribute('data-variant')).toBe('success');
    expect(card.getAttribute('data-variant')).not.toBe('match');
  });

  it('uses the default styling when backend marks a reviewed norm as needing revision', () => {
    renderNormCardItem({
      norm: {
        ...resolvedTopicNormEntry,
        topicNorm: {
          ...topicNorm,
          mvp_status: 'needs_revision',
        },
      },
      selectedNormId: 'norm-1',
    });

    const card = screen.getByTestId('norm-card');

    expect(card.getAttribute('data-variant')).toBe('default');
    expect(screen.getByRole('button', { name: 'Review again' })).not.toBeNull();
  });

  it('keeps the AI trigger visible on reviewed success cards without current results', () => {
    renderNormCardItem({
      norm: {
        ...resolvedTopicNormEntry,
        topicNorm: {
          ...topicNorm,
          mvp_status: 'checked',
        },
      },
    });

    expect(screen.getByRole('button', { name: 'Start AI' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Checked' })).not.toBeNull();
  });

  it('keeps the current AI icon visible on reviewed success cards with current results', () => {
    renderNormCardItem({
      norm: {
        ...resolvedTopicNormEntry,
        topicNorm: {
          ...topicNorm,
          mvp_status: 'checked',
        },
      },
      normIdsWithFundstellen: new Set([normNode.id]),
    });

    expect(screen.queryByRole('button', { name: 'Start AI' })).toBeNull();
    expect(screen.getByTestId('ai-icon')).not.toBeNull();
  });

  it('uses the default card styling while showing the AI update action for outdated results that need revision', () => {
    useDescendantsMock.mockImplementation((nodeType) =>
      nodeType === 'fundstelle'
        ? [{ id: 'fundstelle-1', node_type: 'fundstelle', is_outdated: true }]
        : [{ id: 'tbm-1', node_type: 'atomares_tbm' }],
    );

    renderNormCardItem({
      norm: {
        ...resolvedTopicNormEntry,
        topicNorm: {
          ...topicNorm,
          mvp_status: 'needs_revision',
        },
      },
      normIdsWithFundstellen: new Set([normNode.id]),
    });

    const card = screen.getByTestId('norm-card');

    expect(card.getAttribute('data-variant')).toBe('default');
    expect(screen.getByRole('button', { name: 'Update' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Review again' })).not.toBeNull();
  });

  it('calls the removal flow from the destructive menu item', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    renderNormCardItem({ onRemove });

    await user.click(screen.getByRole('button', { name: 'Remove norm' }));

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('opens the material-completeness request form for the norm', async () => {
    const user = userEvent.setup();
    const onSelectNorm = vi.fn();
    renderNormCardItem({ onSelectNorm });

    await user.click(screen.getByRole('button', { name: 'Request more' }));

    expectMaterialNormSidebarSearch({
      sidebarPanel: 'requestList',
      newRequestListInitItems: [
        {
          title: '§ 44 BNatSchG',
          topicId: 'topic-1',
          sourceRef: materialNormSourceRef,
        },
      ],
    });
    expect(onSelectNorm).not.toHaveBeenCalled();
  });

  it('opens the material-completeness comment form for the norm', async () => {
    const user = userEvent.setup();
    const onSelectNorm = vi.fn();
    renderNormCardItem({ onSelectNorm });

    await user.click(screen.getByRole('button', { name: 'Add comment' }));

    expectMaterialNormSidebarSearch({
      sidebarPanel: 'comments',
      newCommentInitItems: [
        {
          title: '§ 44 BNatSchG',
          processStep: 'materialCompletenessCheck',
          sourceRef: materialNormSourceRef,
        },
      ],
    });
    expect(onSelectNorm).not.toHaveBeenCalled();
  });
});
