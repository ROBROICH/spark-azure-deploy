import '@testing-library/jest-dom/vitest';
import type * as TanstackReactQuery from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiNormDetailView } from './AiNormDetailView';

type WorkflowStatusMatcher = {
  matchIdsInWorkflowId: string[];
  workflowType: string | string[];
};

const mocks = vi.hoisted(() => ({
  mutateMock: vi.fn(),
  navigateMock: vi.fn(),
  observeStartedWorkflowMock: vi.fn(() => Promise.resolve()),
  aiAbsatzSectionMock: vi.fn(),
  useRunningWorkflowMock: vi.fn(),
  hasTopicMutationRightsMock: vi.fn(),
  toastMock: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    dismiss: vi.fn(),
  },
}));

const testState = vi.hoisted(() => ({
  hasAtomareTbm: true,
  hasBewertung: false,
  hasOutdatedBewertung: false,
  mutationIsPending: false,
  topicNormType: 'pruefung' as 'pruefung' | 'verfahren',
  workflowStatusByMatcher: new Map<string, boolean>(),
}));

const getWorkflowStatusMatcherKey = (matcher: WorkflowStatusMatcher) => {
  const workflowTypeKey = Array.isArray(matcher.workflowType)
    ? matcher.workflowType.join('|')
    : matcher.workflowType;

  return `${workflowTypeKey}:${matcher.matchIdsInWorkflowId.join('-')}`;
};

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: mocks.toastMock,
}));

vi.mock('@/features/project/law-changes/ui/LawChangeIndicator', async () => {
  const { createLawChangeIndicatorMock } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    LawChangeIndicator: createLawChangeIndicatorMock('law-change-1'),
  };
});

vi.mock('@tanstack/react-router', async () => {
  const { MockRouterLink } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    getRouteApi: () => ({
      useNavigate: () => mocks.navigateMock,
      useParams: () => ({
        verfahrenId: 'verfahren-1',
      }),
      useSearch: (options?: {
        select?: (search: { topicId: string; topicNormId: string }) => unknown;
      }) => {
        const search = {
          topicId: 'topic-1',
          topicNormId: 'topic-norm-1',
        };

        return options?.select ? options.select(search) : search;
      },
    }),
    Link: MockRouterLink,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'aiAssistance.allChecked': 'All checked',
        'aiAssistance.allNeedsRevision': 'Review all again',
        'aiAssistance.backToOverview': 'Back',
        'aiAssistance.checkAll': 'Check norm',
        'aiAssistance.moreOptions': 'More options',
        'aiAssistance.normHasAiRating': 'AI rating exists',
        'aiAssistance.normHasAiRatingTooltip':
          'This norm has an AI assessment in substantive legal sentences.',
        'aiAssistance.showLegalText': 'Normtext anzeigen',
        'aiAssistance.requestMore': 'Nachfordern',
        'aiAssistance.addComment': 'Kommentar hinzufügen',
        'aiAssistance.startAiAnalysis': 'Start AI',
        'aiAssistance.startAiAnalysisDisabledNoPermissionTooltip':
          'You do not have permission to start the AI analysis.',
        'aiAssistance.startAiAnalysisError':
          'The AI analysis could not be started.',
        'aiAssistance.startAiAnalysisLoading': 'AI running',
        'aiAssistance.startAiAnalysisMissingTbmTooltip':
          'An assessment is not possible here because this norm has no legal criteria.',
        'aiAssistance.aiOutdatedTrigger.refresh': 'Refresh',
        'aiAssistance.aiOutdatedTrigger.refreshLoading': 'Refresh running',
        'aiAssistance.aiTrigger.emptySuccessTitle': 'AI assessment complete',
        'aiAssistance.aiTrigger.emptySuccessBody':
          'No AI assessments were created.',
        'aiAssistance.aiTrigger.proceduralNormNotChecked':
          'This norm is procedural. Therefore, generating an AI assessment for this norm is not possible.',
        'aiAssistance.title': 'AI support',
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock(
  '@/features/access-control/topic-permissions/hasTopicMutationRights',
  () => ({
    useHasTopicMutationRights: () => mocks.hasTopicMutationRightsMock,
  }),
);

vi.mock(
  '@/features/workflow-runtime/workflow-status/useRunningWorkflow',
  () => ({
    useRunningWorkflow: mocks.useRunningWorkflowMock,
    WORKFLOW_TYPE_BEWERTUNG: 'bewertung',
    WORKFLOW_TYPE_SUZ_NORM: 'suche_zuordnung_norm',
  }),
);

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof TanstackReactQuery>();

  return {
    ...actual,
    useMutation: () => ({
      isPending: testState.mutationIsPending,
      mutate: mocks.mutateMock,
    }),
  };
});

vi.mock(
  '@/api-clients/agent-orchestration-module/@tanstack/react-query.gen',
  () => ({
    startBewertungWorkflowWorkflowsBewertungPostMutation: () => ({}),
  }),
);

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    transact: (callback: () => void) => callback(),
    update: vi.fn(),
  }),
}));

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: (nodeType: string) => {
    if (nodeType === 'norm') {
      return [{ id: 'norm-1', node_type: 'norm' }];
    }

    if (nodeType === 'absatz') {
      return [
        { id: 'absatz-10', node_type: 'absatz' },
        { id: 'absatz-2', node_type: 'absatz' },
        { id: 'absatz-1', node_type: 'absatz' },
      ];
    }

    if (nodeType === 'bewertung') {
      return testState.hasBewertung
        ? [
            {
              id: 'bewertung-1',
              is_outdated: testState.hasOutdatedBewertung,
              node_type: 'bewertung',
            },
          ]
        : [];
    }

    if (nodeType === 'atomares_tbm') {
      return testState.hasAtomareTbm
        ? [{ id: 'tbm-1', node_type: 'atomares_tbm' }]
        : [];
    }

    return [];
  },
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNodes: (nodeRefs: { id: string; node_type: string }[]) => ({
    data: nodeRefs.flatMap((nodeRef) => {
      if (nodeRef.node_type !== 'absatz') {
        return [];
      }

      const absatzById = new Map<string, { absatz_nr: string; id: string }>([
        ['absatz-1', { absatz_nr: '1', id: 'absatz-1' }],
        ['absatz-2', { absatz_nr: '2', id: 'absatz-2' }],
        ['absatz-10', { absatz_nr: '10', id: 'absatz-10' }],
      ]);
      const absatz = absatzById.get(nodeRef.id);

      return absatz ? [absatz] : [];
    }),
  }),
  useNode: (nodeRef: { id: string; node_type: string }) => {
    if (nodeRef.node_type === 'topic_norm') {
      return {
        data: {
          satz_statuses: {},
          id: nodeRef.id,
          jurabk: 'BNatSchG',
          node_type: 'topic_norm',
          paragraph_nr: '44',
          topic_id: 'topic-1',
          type: testState.topicNormType,
        },
      };
    }

    if (nodeRef.node_type === 'norm') {
      return {
        data: {
          id: nodeRef.id,
          node_type: 'norm',
          paragraph_nr: '44',
          paragraph_titel: 'Besonderer Artenschutz',
        },
      };
    }

    return {
      data: null,
    };
  },
}));

vi.mock('./AiAbsatzSection', () => ({
  AiAbsatzSection: (props: {
    absatzRef: { id: string; node_type: string };
    showMissingAssessmentTooltip?: boolean;
  }) => {
    mocks.aiAbsatzSectionMock(props);

    return <div>Absatz section {props.absatzRef.id}</div>;
  },
}));

vi.mock('../shared/AiTopicHeader', () => ({
  AiTopicHeader: (props: {
    leading?: ReactNode;
    trailing?: ReactNode;
    titleKey: string;
  }) => (
    <header>
      {props.leading}
      <h1>{props.titleKey}</h1>
      {props.trailing}
    </header>
  ),
}));

vi.mock('@/features/ui/action-menu/ActionMenu', async () => {
  const { createActionMenuMock } =
    await import('@/features/project/test/projectUiTestMocks');

  return createActionMenuMock();
});

vi.mock('@/features/ui/alert/Alert', async () => {
  const { MockAlert, MockAlertDescription, MockAlertTitle } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    Alert: MockAlert,
    AlertDescription: MockAlertDescription,
    AlertTitle: MockAlertTitle,
  };
});

vi.mock('@/features/ui/ai/AiButton', () => ({
  AiButton: (
    props: ComponentProps<'button'> & {
      isDisabled?: boolean;
      isLoading?: boolean;
      label: string;
      disabledTooltip?: ReactNode;
    },
  ) => {
    const {
      disabledTooltip,
      isDisabled = false,
      isLoading = false,
      label,
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

vi.mock('@/features/ui/ai/AiSparklesChip', () => ({
  AiSparklesChip: () => <span>AI</span>,
}));

vi.mock('@/features/ui/tooltip/TooltipWrapper', () => ({
  TooltipWrapper: (props: { children: ReactNode }) => <>{props.children}</>,
}));

vi.mock('@/features/ui/skeleton/Skeleton', () => ({
  Skeleton: () => <div data-testid="skeleton" />,
}));

vi.mock('@/features/ui/button/Button', async () => {
  const { MockButton } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    Button: MockButton,
  };
});

vi.mock('@/features/ui/button/SplitButton', () => ({
  SplitButton: (props: {
    checked: boolean;
    checkedLabel: string;
    disabled?: boolean;
    uncheckedLabel: string;
  }) => (
    <button type="button" disabled={props.disabled}>
      {props.checked ? props.checkedLabel : props.uncheckedLabel}
    </button>
  ),
}));

describe('AiNormDetailView', () => {
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  beforeEach(() => {
    testState.hasAtomareTbm = true;
    testState.hasBewertung = false;
    testState.hasOutdatedBewertung = false;
    testState.mutationIsPending = false;
    testState.topicNormType = 'pruefung';
    testState.workflowStatusByMatcher.clear();
    mocks.mutateMock.mockReset();
    mocks.navigateMock.mockReset();
    mocks.observeStartedWorkflowMock.mockReset();
    mocks.aiAbsatzSectionMock.mockReset();
    mocks.useRunningWorkflowMock.mockReset();
    mocks.hasTopicMutationRightsMock.mockReset();
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);
    mocks.toastMock.error.mockReset();
    mocks.useRunningWorkflowMock.mockImplementation(
      (options: WorkflowStatusMatcher) => ({
        isRunning:
          testState.workflowStatusByMatcher.get(
            getWorkflowStatusMatcherKey(options),
          ) ?? false,
        observeStarted: mocks.observeStartedWorkflowMock,
      }),
    );
  });

  it('marks the AI start button loading while the SUZ norm pre-workflow is running', () => {
    testState.workflowStatusByMatcher.set(
      getWorkflowStatusMatcherKey({
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
        workflowType: 'suche_zuordnung_norm',
      }),
      true,
    );

    render(<AiNormDetailView />);

    const button = screen.getByRole('button', { name: 'AI running' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
    expect(mocks.useRunningWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
        workflowType: 'suche_zuordnung_norm',
      }),
    );
  });

  it('shows the initial AI trigger when there is no data and no workflow is running', () => {
    testState.workflowStatusByMatcher.set(
      getWorkflowStatusMatcherKey({
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
        workflowType: ['bewertung', 'BewertungOrchestratorWorkflow'],
      }),
      false,
    );

    render(<AiNormDetailView />);

    expect(
      screen.getByRole('button', { name: 'Start AI' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'AI running' })).toBeNull();
    expect(mocks.useRunningWorkflowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        matchIdsInWorkflowId: ['verfahren-1', 'norm-1'],
        workflowType: ['bewertung', 'BewertungOrchestratorWorkflow'],
      }),
    );
    expect(screen.queryByText('Materiell-rechtlich')).toBeNull();
  });

  it('shows a procedural norm notice instead of the AI start action', () => {
    testState.topicNormType = 'verfahren';

    render(<AiNormDetailView />);

    expect(
      screen.getByText(
        'This norm is procedural. Therefore, generating an AI assessment for this norm is not possible.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Verfahrensrechtlich')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Start AI' })).toBeNull();
  });

  it('observes the Bewertung workflow after start', () => {
    mocks.mutateMock.mockImplementation((_variables, callbacks) => {
      callbacks?.onSuccess?.({ parentJobId: 'bewertung-workflow-norm-1' });
    });

    render(<AiNormDetailView />);

    fireEvent.click(screen.getByRole('button', { name: 'Start AI' }));

    expect(mocks.mutateMock).toHaveBeenCalledOnce();
    expect(mocks.observeStartedWorkflowMock).toHaveBeenCalledWith(
      'bewertung-workflow-norm-1',
    );
  });

  it('shows a toast error when the Bewertung workflow fails to start', async () => {
    const user = userEvent.setup();

    mocks.mutateMock.mockImplementation((_variables, callbacks) => {
      callbacks?.onError?.();
    });

    render(<AiNormDetailView />);

    await user.click(screen.getByRole('button', { name: 'Start AI' }));

    expect(mocks.toastMock.error).toHaveBeenCalledWith(
      'The AI analysis could not be started.',
    );
  });

  it('does not start Bewertung workflow without topic mutation rights', async () => {
    const user = userEvent.setup();
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);

    render(<AiNormDetailView />);

    const button = screen.getByRole('button', { name: 'Start AI' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'data-disabled-tooltip',
      'You do not have permission to start the AI analysis.',
    );

    await user.click(button);

    expect(mocks.hasTopicMutationRightsMock).toHaveBeenCalledWith('topic-1');
    expect(mocks.mutateMock).not.toHaveBeenCalled();
  });

  it('disables the AI start button when the norm has no atomare TBM descendants', async () => {
    const user = userEvent.setup();
    testState.hasAtomareTbm = false;

    render(<AiNormDetailView />);

    const button = screen.getByRole('button', { name: 'Start AI' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'data-disabled-tooltip',
      'An assessment is not possible here because this norm has no legal criteria.',
    );

    await user.click(button);

    expect(mocks.mutateMock).not.toHaveBeenCalled();
  });

  it('shows the permission tooltip before the missing-TBM tooltip', () => {
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);
    testState.hasAtomareTbm = false;

    render(<AiNormDetailView />);

    expect(screen.getByRole('button', { name: 'Start AI' })).toHaveAttribute(
      'data-disabled-tooltip',
      'You do not have permission to start the AI analysis.',
    );
  });

  it('disables outdated Bewertung refresh when the norm has no atomare TBM descendants', async () => {
    const user = userEvent.setup();
    testState.hasAtomareTbm = false;
    testState.hasBewertung = true;
    testState.hasOutdatedBewertung = true;

    render(<AiNormDetailView />);

    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute(
      'data-disabled-tooltip',
      'An assessment is not possible here because this norm has no legal criteria.',
    );

    await user.click(button);

    expect(mocks.mutateMock).not.toHaveBeenCalled();
  });

  it('passes the missing-sentence-bewertung tooltip flag when the AI badge is shown', () => {
    testState.hasBewertung = true;

    render(<AiNormDetailView />);

    expect(screen.queryByRole('button', { name: 'Start AI' })).toBeNull();
    expect(mocks.aiAbsatzSectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        showMissingAssessmentTooltip: true,
        requestTitlePrefix: '§ 44',
        requestTitleSuffix: 'BNatSchG',
      }),
    );
  });

  it('renders Absatz sections sorted by Absatz number', () => {
    render(<AiNormDetailView />);

    expect(
      mocks.aiAbsatzSectionMock.mock.calls.map(([props]) => props.absatzRef.id),
    ).toEqual(['absatz-1', 'absatz-2', 'absatz-10']);
  });

  it('opens the legal-review request form for the norm', async () => {
    const user = userEvent.setup();

    render(<AiNormDetailView />);

    await user.click(screen.getByRole('button', { name: 'Nachfordern' }));

    const navigateOptions = mocks.navigateMock.mock.calls[0]?.[0];
    expect(navigateOptions).toBeDefined();
    if (!navigateOptions) {
      throw new Error('Expected navigation options');
    }
    const nextSearch = navigateOptions.search({ topicNormId: 'topic-norm-1' });

    expect(nextSearch).toEqual({
      topicNormId: 'topic-norm-1',
      sidebarPanel: 'requestList',
      newRequestListInitItems: [
        {
          title: '§ 44 BNatSchG',
          topicId: 'topic-1',
          sourceRef: {
            type: 'materialNorm',
            itemId: 'norm-1',
          },
        },
      ],
    });
    expect(navigateOptions.replace).toBe(true);
    expect(navigateOptions.resetScroll).toBe(false);
  });

  it('opens the norm text subview from the action menu', async () => {
    const user = userEvent.setup();

    render(<AiNormDetailView />);

    await user.click(screen.getByRole('button', { name: 'Normtext anzeigen' }));

    const navigateOptions = mocks.navigateMock.mock.calls[0]?.[0];
    expect(navigateOptions).toBeDefined();
    if (!navigateOptions) {
      throw new Error('Expected navigation options');
    }
    const nextSearch = navigateOptions.search({ topicNormId: 'topic-norm-1' });

    expect(nextSearch).toEqual({
      topicNormId: 'topic-norm-1',
      showNormtext: true,
    });
    expect(navigateOptions.resetScroll).toBe(false);
  });

  it('opens the law-change dialog from the selected norm title row', async () => {
    const user = userEvent.setup();

    render(<AiNormDetailView />);

    await user.click(
      screen.getByRole('button', { name: 'Rechtsänderung anzeigen' }),
    );

    const navigateOptions = mocks.navigateMock.mock.calls[0]?.[0];
    expect(navigateOptions).toBeDefined();
    if (!navigateOptions) {
      throw new Error('Expected navigation options');
    }
    const nextSearch = navigateOptions.search({ topicNormId: 'topic-norm-1' });

    expect(nextSearch).toEqual({
      topicNormId: 'topic-norm-1',
      lawChangeId: 'law-change-1',
    });
    expect(navigateOptions.replace).toBe(true);
    expect(navigateOptions.resetScroll).toBe(false);
  });

  it('opens the legal-review comment form for the norm', async () => {
    const user = userEvent.setup();

    render(<AiNormDetailView />);

    await user.click(
      screen.getByRole('button', { name: 'Kommentar hinzufügen' }),
    );

    const navigateOptions = mocks.navigateMock.mock.calls[0]?.[0];
    expect(navigateOptions).toBeDefined();
    if (!navigateOptions) {
      throw new Error('Expected navigation options');
    }
    const nextSearch = navigateOptions.search({ topicNormId: 'topic-norm-1' });

    expect(nextSearch).toEqual({
      topicNormId: 'topic-norm-1',
      sidebarPanel: 'comments',
      newCommentInitItems: [
        {
          title: '§ 44 BNatSchG',
          processStep: 'legalReview',
          sourceRef: {
            type: 'materialNorm',
            itemId: 'norm-1',
          },
        },
      ],
    });
    expect(navigateOptions.replace).toBe(true);
    expect(navigateOptions.resetScroll).toBe(false);
  });
});
