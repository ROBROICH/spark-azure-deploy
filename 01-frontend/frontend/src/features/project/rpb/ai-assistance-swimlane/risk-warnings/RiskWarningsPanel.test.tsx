import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { partitionRisksByStatus, RiskWarningsPanel } from './RiskWarningsPanel';

const mocks = vi.hoisted(() => ({
  canMutateProject: false,
  hasTopicMutationRightsMock: vi.fn<(topicId: string | null) => boolean>(),
  transactMock: vi.fn((callback: () => void) => callback()),
  updateMock: vi.fn(),
  mutateMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  toastErrorMock: vi.fn(),
  observeStartedWorkflowMock: vi.fn(() => Promise.resolve()),
  isBeschlussCommitPending: false,
  outlineNodeIdMock: 'leaf' as string | undefined,
  risks: [] as NodePayloadByType<'risks'>[],
  selectedVaeNodeAssignedTopicId: 'topic-1' as string | undefined,
  selectedVaeNodeMutationTopicId: 'topic-1' as string | null | undefined,
  vaeNodes: [] as NodePayloadByType<'vae_node'>[],
  startMutationOptions: null as null | {
    onError?: (error: unknown) => void;
    onSuccess?: (workflow: { parentJobId: string }) => void;
  },
  workflowOptions: null as null | {
    workflowType?: unknown;
    matchIdsInWorkflowId?: string[];
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
    useSearch: (input: {
      select: (search: { outlineNodeId?: string }) => unknown;
    }) => input.select({ outlineNodeId: mocks.outlineNodeIdMock }),
  }),
  Link: (props: { children?: React.ReactNode }) => <a>{props.children}</a>,
}));

vi.mock('@/db/nodes/hooks/useGraph', () => ({
  useGraph: () => ({ index: {} }),
}));

vi.mock('@/db/nodes/examinationGraphModel', () => ({
  getDescendantNodeRefsByType: (
    _index: unknown,
    startId: string,
    nodeType: string,
  ) =>
    mocks.risks
      .filter((risk) => risk.vae_node_id === startId)
      .map((risk) => ({ id: risk.id, node_type: nodeType })),
}));

vi.mock('@/db/nodes/hooks/useLiveNodes', () => ({
  useLiveNodes: (refs: { id: string }[]) => ({
    data: refs.flatMap((ref) =>
      mocks.risks.filter((risk) => risk.id === ref.id),
    ),
  }),
}));

vi.mock('../../workspace-state/RpbOutlineContext', () => ({
  useRpbVaeNodeUrlState: () => {
    const selectedVaeNode =
      mocks.outlineNodeIdMock === undefined
        ? null
        : (mocks.vaeNodes.find(
            (vaeNode) => vaeNode.id === mocks.outlineNodeIdMock,
          ) ?? null);

    return {
      selectedVaeNode,
      selectedVaeNodeAssignedTopicId: selectedVaeNode
        ? mocks.selectedVaeNodeAssignedTopicId
        : undefined,
      selectedVaeNodeMutationTopicId: selectedVaeNode
        ? mocks.selectedVaeNodeMutationTopicId
        : undefined,
      selectedVaeNodeId: mocks.outlineNodeIdMock ?? '',
    };
  },
}));

vi.mock(
  '@/features/access-control/topic-permissions/hasTopicMutationRights',
  () => ({
    useHasTopicMutationRights: () => mocks.hasTopicMutationRightsMock,
  }),
);

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: (params: { requiredLevel: 'owner' | 'user' }) => ({
      canMutateProject:
        params.requiredLevel === 'user' ? mocks.canMutateProject : false,
    }),
  }),
);

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    transact: mocks.transactMock,
    update: mocks.updateMock,
  }),
}));

vi.mock('../../workspace-state/RpbFeatureContext', () => ({
  useRpbFeatureContext: () => ({
    isBeschlussCommitPending: mocks.isBeschlussCommitPending,
    trackBeschlussCommit: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutate: (
      variables: unknown,
      options?: {
        onError?: (e: unknown) => void;
        onSuccess?: (workflow: { parentJobId: string }) => void;
      },
    ) => {
      mocks.startMutationOptions = options ?? null;
      mocks.mutateMock(variables, options);
    },
    isPending: false,
  }),
}));

vi.mock(
  '@/api-clients/agent-orchestration-module/@tanstack/react-query.gen',
  () => ({
    startRisikohinweiseWorkflowWorkflowsRisikohinweisePostMutation: () => ({}),
  }),
);

vi.mock('@sentry/react', () => ({
  captureException: (...args: unknown[]) => mocks.captureExceptionMock(...args),
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: { error: (...args: unknown[]) => mocks.toastErrorMock(...args) },
}));

vi.mock(
  '@/features/workflow-runtime/workflow-status/useRunningWorkflow',
  () => ({
    useRunningWorkflow: (
      options:
        | {
            workflowType?: unknown;
            matchIdsInWorkflowId?: string[];
          }
        | undefined,
    ) => {
      mocks.workflowOptions = options ?? null;
      return {
        isRunning: false,
        observeStarted: mocks.observeStartedWorkflowMock,
      };
    },
    WORKFLOW_TYPE_RISIKOHINWEISE: 'risikohinweise',
  }),
);

vi.mock('@/features/ui/swimlanes/Swimlanes', () => ({
  Swimlanes: {
    HeaderPortal: (props: { children: React.ReactNode }) => (
      <div data-testid="lane-header">{props.children}</div>
    ),
  },
}));

vi.mock('@/features/ui/ai/AiButton', () => ({
  AiButton: (props: {
    label: string;
    isDisabled?: boolean;
    onClick: () => void;
  }) => (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.isDisabled}
      aria-label={props.label}
    >
      {props.label}
    </button>
  ),
}));

const buildRisk = (
  overrides: Partial<NodePayloadByType<'risks'>> & { id: string },
): NodePayloadByType<'risks'> => {
  const { id, ...rest } = overrides;
  return {
    node_type: 'risks',
    id,
    compositeKey: toCompositeKey({ id, node_type: 'risks' }),
    vae_node_id: 'leaf',
    problem: 'p',
    recommendation: null,
    quote: null,
    severity: 5,
    implication: 'i',
    status: 'open',
    project_id: 'project-1',
    is_deleted: false,
    is_outdated: false,
    frontend_parent_ids: [],
    project_version: 0,
    update_type: null,
    created_at: '',
    updated_at: '',
    sys_period: null,
    ...rest,
  };
};

const buildVaeNode = (
  overrides: Partial<NodePayloadByType<'vae_node'>> & { id: string },
): NodePayloadByType<'vae_node'> => {
  const { id, ...rest } = overrides;
  return {
    node_type: 'vae_node',
    id,
    compositeKey: toCompositeKey({ id, node_type: 'vae_node' }),
    parent_vae_node_id: null,
    assignee: null,
    checked_by_assignee: false,
    checked_by_leader: false,
    checked_at_assignee: null,
    checked_at_leader: null,
    topic_id: null,
    subtopic_id: null,
    template_id: null,
    project_id: 'project-1',
    project_version: 0,
    is_deleted: false,
    is_outdated: false,
    frontend_parent_ids: [],
    update_type: null,
    created_at: '',
    updated_at: '',
    sys_period: null,
    order: 0,
    text: '',
    title: '',
    can_add_child: false,
    is_hidden: false,
    ...rest,
  } satisfies NodePayloadByType<'vae_node'>;
};

describe('partitionRisksByStatus', () => {
  it('groups by status and drops soft-deleted entries', () => {
    const result = partitionRisksByStatus([
      buildRisk({ id: 'r1', status: 'open' }),
      buildRisk({ id: 'r2', status: 'corrected' }),
      buildRisk({ id: 'r3', status: 'ignored' }),
      buildRisk({ id: 'r4', status: 'open', is_deleted: true }),
    ]);

    expect(result.open).toHaveLength(1);
    expect(result.open.at(0)?.id).toBe('r1');
    expect(result.corrected.map((risk) => risk.id)).toEqual(['r2']);
    expect(result.ignored.map((risk) => risk.id)).toEqual(['r3']);
  });
});

describe('RiskWarningsPanel mutation gating', () => {
  beforeEach(() => {
    mocks.hasTopicMutationRightsMock.mockReset();
    mocks.transactMock.mockClear();
    mocks.updateMock.mockReset();
    mocks.mutateMock.mockReset();
    mocks.captureExceptionMock.mockReset();
    mocks.toastErrorMock.mockReset();
    mocks.observeStartedWorkflowMock.mockClear();
    mocks.canMutateProject = false;
    mocks.isBeschlussCommitPending = false;
    mocks.startMutationOptions = null;
    mocks.workflowOptions = null;
    mocks.outlineNodeIdMock = 'leaf';
    mocks.risks = [buildRisk({ id: 'r1', status: 'open' })];
    mocks.selectedVaeNodeAssignedTopicId = 'topic-1';
    mocks.selectedVaeNodeMutationTopicId = 'topic-1';
    mocks.vaeNodes = [buildVaeNode({ id: 'leaf', topic_id: 'topic-1' })];
  });

  afterEach(cleanup);

  it('skips status mutations when the user lacks topic rights for the risk', async () => {
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);

    render(<RiskWarningsPanel />);
    await userEvent.click(
      screen.getByRole('button', { name: 'riskWarnings.actions.dismiss' }),
    );

    expect(mocks.hasTopicMutationRightsMock).toHaveBeenCalledWith('topic-1');
    expect(
      screen.getByRole('button', { name: 'riskWarnings.actions.dismiss' }),
    ).toBeDisabled();
    expect(mocks.transactMock).not.toHaveBeenCalled();
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  it('runs the status mutation when the user has topic rights', async () => {
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);
    const risk = buildRisk({ id: 'r1', status: 'open' });
    mocks.risks = [risk];

    render(<RiskWarningsPanel />);
    await userEvent.click(
      screen.getByRole('button', { name: 'riskWarnings.actions.dismiss' }),
    );

    expect(mocks.transactMock).toHaveBeenCalledTimes(1);
    expect(mocks.updateMock).toHaveBeenCalledTimes(1);

    const [updatedRisk, updater] = mocks.updateMock.mock.calls[0] as [
      NodePayloadByType<'risks'>,
      (draft: NodePayloadByType<'risks'>) => void,
    ];
    expect(updatedRisk).toBe(risk);

    const draft = { ...risk };
    updater(draft);
    expect(draft.status).toBe('ignored');
  });

  it('runs the status mutation for a no-topic risk when the user can mutate the project', async () => {
    mocks.canMutateProject = true;
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);
    const risk = buildRisk({ id: 'r1', status: 'open' });
    mocks.risks = [risk];
    mocks.vaeNodes = [buildVaeNode({ id: 'leaf', topic_id: null })];
    mocks.selectedVaeNodeAssignedTopicId = undefined;
    mocks.selectedVaeNodeMutationTopicId = null;

    render(<RiskWarningsPanel />);
    await userEvent.click(
      screen.getByRole('button', { name: 'riskWarnings.actions.dismiss' }),
    );

    expect(mocks.hasTopicMutationRightsMock).not.toHaveBeenCalled();
    expect(mocks.transactMock).toHaveBeenCalledTimes(1);
    expect(mocks.updateMock).toHaveBeenCalledTimes(1);

    const [, updater] = mocks.updateMock.mock.calls[0] as [
      NodePayloadByType<'risks'>,
      (draft: NodePayloadByType<'risks'>) => void,
    ];
    const draft = { ...risk };
    updater(draft);
    expect(draft.status).toBe('ignored');
  });

  it('skips status mutations for a no-topic risk when the user cannot mutate the project', async () => {
    mocks.canMutateProject = false;
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);
    mocks.vaeNodes = [buildVaeNode({ id: 'leaf', topic_id: null })];
    mocks.selectedVaeNodeAssignedTopicId = undefined;
    mocks.selectedVaeNodeMutationTopicId = null;

    render(<RiskWarningsPanel />);
    const dismissButton = screen.getByRole('button', {
      name: 'riskWarnings.actions.dismiss',
    });
    await userEvent.click(dismissButton);

    expect(mocks.hasTopicMutationRightsMock).not.toHaveBeenCalled();
    expect(dismissButton).toBeDisabled();
    expect(mocks.transactMock).not.toHaveBeenCalled();
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  it('skips status mutations when topic ownership cannot be resolved', async () => {
    mocks.canMutateProject = true;
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);
    mocks.vaeNodes = [
      buildVaeNode({ id: 'leaf', parent_vae_node_id: 'missing-parent' }),
    ];
    mocks.selectedVaeNodeAssignedTopicId = undefined;
    mocks.selectedVaeNodeMutationTopicId = undefined;

    render(<RiskWarningsPanel />);
    const dismissButton = screen.getByRole('button', {
      name: 'riskWarnings.actions.dismiss',
    });
    await userEvent.click(dismissButton);

    expect(mocks.hasTopicMutationRightsMock).not.toHaveBeenCalled();
    expect(dismissButton).toBeDisabled();
    expect(mocks.transactMock).not.toHaveBeenCalled();
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  it('renders only risks for the selected outline node', () => {
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);
    mocks.risks = [
      buildRisk({ id: 'visible-risk', problem: 'visible problem' }),
      buildRisk({
        id: 'other-risk',
        problem: 'hidden problem',
        vae_node_id: 'other-leaf',
      }),
    ];
    mocks.vaeNodes = [
      buildVaeNode({ id: 'leaf', topic_id: 'topic-1' }),
      buildVaeNode({ id: 'other-leaf', topic_id: 'topic-1' }),
    ];

    render(<RiskWarningsPanel />);

    expect(screen.getAllByText('visible problem')).not.toHaveLength(0);
    expect(screen.queryByText('hidden problem')).not.toBeInTheDocument();
  });

  it('matches the risk warning workflow without hard-coding a project version', () => {
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);

    render(<RiskWarningsPanel />);

    expect(mocks.workflowOptions).toMatchObject({
      workflowType: 'risikohinweise',
      matchIdsInWorkflowId: ['verfahren-1', 'leaf'],
    });
  });

  it('shows the AI trigger card instead of status categories when there are no active risks', () => {
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);
    mocks.risks = [buildRisk({ id: 'r1', is_deleted: true })];

    render(<RiskWarningsPanel />);

    expect(
      screen.getByText('riskWarnings.emptyState.title'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'riskWarnings.startAnalysis.retryLabel',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('riskWarnings.sections.open'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('riskWarnings.sections.corrected'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText('riskWarnings.sections.ignored'),
    ).not.toBeInTheDocument();
  });

  it('starts the workflow from the empty risk trigger card', async () => {
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);
    mocks.risks = [];

    render(<RiskWarningsPanel />);

    const triggerCard = screen
      .getByText('riskWarnings.emptyState.title')
      .closest('section');
    expect(triggerCard).not.toBeNull();

    await userEvent.click(
      within(triggerCard as HTMLElement).getByRole('button', {
        name: 'riskWarnings.startAnalysis.label',
      }),
    );

    expect(mocks.mutateMock).toHaveBeenCalledWith(
      { body: { projectId: 'verfahren-1', vaeNodeId: 'leaf' } },
      expect.objectContaining({
        onError: expect.any(Function),
        onSuccess: expect.any(Function),
      }),
    );

    mocks.startMutationOptions?.onSuccess?.({
      parentJobId: 'risikohinweise-workflow-leaf',
    });
    expect(mocks.observeStartedWorkflowMock).toHaveBeenCalledWith(
      'risikohinweise-workflow-leaf',
    );
  });

  it('starts the workflow for a selected outline node without a topic when the user can mutate the project', async () => {
    mocks.canMutateProject = true;
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);
    mocks.risks = [];
    mocks.vaeNodes = [buildVaeNode({ id: 'leaf', topic_id: null })];
    mocks.selectedVaeNodeAssignedTopicId = undefined;
    mocks.selectedVaeNodeMutationTopicId = null;

    render(<RiskWarningsPanel />);

    const triggerCard = screen
      .getByText('riskWarnings.emptyState.title')
      .closest('section');
    expect(triggerCard).not.toBeNull();

    await userEvent.click(
      within(triggerCard as HTMLElement).getByRole('button', {
        name: 'riskWarnings.startAnalysis.label',
      }),
    );

    expect(mocks.hasTopicMutationRightsMock).not.toHaveBeenCalled();
    expect(mocks.mutateMock).toHaveBeenCalledWith(
      { body: { projectId: 'verfahren-1', vaeNodeId: 'leaf' } },
      expect.objectContaining({
        onError: expect.any(Function),
        onSuccess: expect.any(Function),
      }),
    );
  });

  it('does not start the workflow for a selected outline node without a topic when the user cannot mutate the project', async () => {
    mocks.canMutateProject = false;
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);
    mocks.risks = [];
    mocks.vaeNodes = [buildVaeNode({ id: 'leaf', topic_id: null })];
    mocks.selectedVaeNodeAssignedTopicId = undefined;
    mocks.selectedVaeNodeMutationTopicId = null;

    render(<RiskWarningsPanel />);

    const triggerCard = screen
      .getByText('riskWarnings.emptyState.title')
      .closest('section');
    expect(triggerCard).not.toBeNull();

    const startButton = within(triggerCard as HTMLElement).getByRole('button', {
      name: 'riskWarnings.startAnalysis.label',
    });

    expect(startButton).toBeDisabled();

    await userEvent.click(startButton);

    expect(mocks.hasTopicMutationRightsMock).not.toHaveBeenCalled();
    expect(mocks.mutateMock).not.toHaveBeenCalled();
  });

  it('does not start the workflow when outline topic ownership cannot be resolved', async () => {
    mocks.canMutateProject = true;
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);
    mocks.risks = [];
    mocks.vaeNodes = [
      buildVaeNode({ id: 'leaf', parent_vae_node_id: 'missing-parent' }),
    ];
    mocks.selectedVaeNodeAssignedTopicId = undefined;
    mocks.selectedVaeNodeMutationTopicId = undefined;

    render(<RiskWarningsPanel />);

    const triggerCard = screen
      .getByText('riskWarnings.emptyState.title')
      .closest('section');
    expect(triggerCard).not.toBeNull();

    const startButton = within(triggerCard as HTMLElement).getByRole('button', {
      name: 'riskWarnings.startAnalysis.label',
    });
    expect(startButton).toBeDisabled();

    await userEvent.click(startButton);

    expect(mocks.hasTopicMutationRightsMock).not.toHaveBeenCalled();
    expect(mocks.mutateMock).not.toHaveBeenCalled();
  });

  it('shows the no-selection empty state without an AI workflow trigger when no outline node is selected', () => {
    mocks.outlineNodeIdMock = undefined;
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);

    render(<RiskWarningsPanel />);

    expect(
      screen.getByText('riskWarnings.emptyState.noSelectionTitle'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('riskWarnings.emptyState.noSelectionBody'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'riskWarnings.startAnalysis.retryLabel',
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'riskWarnings.startAnalysis.label',
      }),
    ).not.toBeInTheDocument();
    expect(mocks.workflowOptions).toMatchObject({
      workflowType: 'risikohinweise',
      matchIdsInWorkflowId: undefined,
    });
    expect(mocks.mutateMock).not.toHaveBeenCalled();
  });

  it('shows the no-selection empty state when the URL outline node does not resolve', () => {
    mocks.outlineNodeIdMock = 'missing-leaf';
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);
    mocks.risks = [buildRisk({ id: 'r1', vae_node_id: 'missing-leaf' })];
    mocks.vaeNodes = [buildVaeNode({ id: 'leaf', topic_id: 'topic-1' })];

    render(<RiskWarningsPanel />);

    expect(
      screen.getByText('riskWarnings.emptyState.noSelectionTitle'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'riskWarnings.startAnalysis.label',
      }),
    ).not.toBeInTheDocument();
  });

  it('disables the AI workflow trigger when the user lacks topic rights for the outline node', () => {
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);

    render(<RiskWarningsPanel />);

    expect(
      screen.getByRole('button', {
        name: 'riskWarnings.startAnalysis.retryLabel',
      }),
    ).toBeDisabled();
    expect(mocks.mutateMock).not.toHaveBeenCalled();
  });

  it('disables the header AI workflow trigger while Beschluss text is being saved', async () => {
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);
    mocks.isBeschlussCommitPending = true;

    render(<RiskWarningsPanel />);

    const startButton = screen.getByRole('button', {
      name: 'riskWarnings.startAnalysis.retryLabel',
    });
    expect(startButton).toBeDisabled();

    await userEvent.click(startButton);

    expect(mocks.mutateMock).not.toHaveBeenCalled();
  });

  it('disables the empty-state AI workflow trigger while Beschluss text is being saved', async () => {
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);
    mocks.isBeschlussCommitPending = true;
    mocks.risks = [];

    render(<RiskWarningsPanel />);

    const triggerCard = screen
      .getByText('riskWarnings.emptyState.title')
      .closest('section');
    expect(triggerCard).not.toBeNull();

    const startButton = within(triggerCard as HTMLElement).getByRole('button', {
      name: 'riskWarnings.startAnalysis.label',
    });
    expect(startButton).toBeDisabled();

    await userEvent.click(startButton);

    expect(mocks.mutateMock).not.toHaveBeenCalled();
  });

  it('starts the workflow and surfaces toast + Sentry on error', async () => {
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);

    render(<RiskWarningsPanel />);
    await userEvent.click(
      screen.getByRole('button', {
        name: 'riskWarnings.startAnalysis.retryLabel',
      }),
    );

    expect(mocks.mutateMock).toHaveBeenCalledTimes(1);
    expect(mocks.mutateMock).toHaveBeenCalledWith(
      { body: { projectId: 'verfahren-1', vaeNodeId: 'leaf' } },
      expect.objectContaining({ onError: expect.any(Function) }),
    );

    const startupError = new Error('boom');
    mocks.startMutationOptions?.onError?.(startupError);

    expect(mocks.captureExceptionMock).toHaveBeenCalledWith(startupError);
    expect(mocks.toastErrorMock).toHaveBeenCalledWith(
      'riskWarnings.startAnalysis.error',
    );
  });
});
