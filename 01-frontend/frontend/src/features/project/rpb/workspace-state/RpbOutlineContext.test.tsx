import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import type { NodePayloadByType } from '@/db/nodes/types';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import { useMemo, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RpbOutlineProvider,
  useRpbOutlineCheckState,
  useRpbOutlineExpansionStateContext,
  useRpbOutlineTreeState,
  useRpbVaeNodeUrlState,
} from './RpbOutlineContext';

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  transactMock: vi.fn((callback: () => void) => {
    callback();
  }),
  updateMock: vi.fn(),
  useNodesByTypeMock: vi.fn(),
  hasTopicMutationRightsMock: vi.fn(),
  canApproveFinalDecision: false,
  canMutateProject: false,
}));

let routeSearch: {
  aiLane?: 'risikohinweise';
  amendmentDialogRowId?: string;
  gesetzId?: string;
  outlineNodeId?: string;
  participationSubtopicId?: string;
  previewDocumentId?: string;
  satzId?: string;
  selectedFundstelleId?: string;
  showNormtext?: boolean;
  tbmId?: string;
  topicId?: string;
  topicNormId?: string;
};

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'verfahren-1' }),
    useNavigate: () => mocks.navigateMock,
    useSearch: (options?: {
      select?: (search: typeof routeSearch) => unknown;
    }) => (options?.select ? options.select(routeSearch) : routeSearch),
  }),
}));

vi.mock('@/db/nodes/hooks/useNodesByType', () => ({
  useNodesByType: (nodeType: string) => mocks.useNodesByTypeMock(nodeType),
}));

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    transact: mocks.transactMock,
    update: mocks.updateMock,
  }),
}));

// Project permission mocks are captured at hook-call time (render), not reactively.
// Mutate them BEFORE render() in each test; changes after render() have no effect.
vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: (params: { requiredLevel: 'owner' | 'user' }) => ({
      canMutateProject:
        params.requiredLevel === 'owner'
          ? mocks.canApproveFinalDecision
          : mocks.canMutateProject,
    }),
  }),
);

vi.mock(
  '@/features/access-control/topic-permissions/hasTopicMutationRights',
  () => ({
    useHasTopicMutationRights: () => mocks.hasTopicMutationRightsMock,
  }),
);

// Intentionally duplicated from rpbOutlineTree.test.ts — these tests may need
// different overrides as the context and utility layers diverge.
const createVaeNode = (
  overrides: Partial<NodePayloadByType<'vae_node'>> & {
    id: string;
    title: string;
  },
): NodePayloadByType<'vae_node'> => {
  return {
    nodeType: 'vae_node',
    id: overrides.id,
    title: overrides.title,
    text: overrides.text ?? '',
    assignee: overrides.assignee ?? null,
    checkedByAssignee: overrides.checkedByAssignee ?? false,
    checkedByLeader: overrides.checkedByLeader ?? false,
    checkedAtAssignee: overrides.checkedAtAssignee ?? null,
    checkedAtLeader: overrides.checkedAtLeader ?? null,
    parentVaeNodeId: overrides.parentVaeNodeId ?? null,
    order: overrides.order ?? 0,
    templateId: overrides.templateId ?? null,
    isHidden: overrides.isHidden ?? false,
    canAddChild: overrides.canAddChild ?? false,
    topicId: overrides.topicId ?? null,
    subtopicId: overrides.subtopicId ?? null,
    projectId: overrides.projectId ?? 'project-1',
    isDeleted: overrides.isDeleted ?? false,
    frontendParentIds: overrides.frontendParentIds ?? [],
    updateType: overrides.updateType ?? null,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00Z',
    compositeKey: overrides.compositeKey
      ? overrides.compositeKey
      : toCompositeKey({
          id: overrides.id,
          nodeType: 'vae_node',
        }),
  };
};

const nodes = [
  createVaeNode({
    id: 'root',
    title: 'Root',
    order: 1,
    topicId: 'topic-root',
  }),
  createVaeNode({
    id: 'child-topic',
    title: 'Child Topic',
    order: 1,
    parentVaeNodeId: 'root',
    topicId: 'topic-child',
  }),
  createVaeNode({
    id: 'grandchild',
    title: 'Grandchild',
    order: 1,
    parentVaeNodeId: 'child-topic',
  }),
] satisfies NodePayloadByType<'vae_node'>[];

const OutlineProbe = () => {
  const { expandedNodeIds } = useRpbOutlineExpansionStateContext();
  const { toggleOutlineNodeChecked } = useRpbOutlineCheckState();
  const {
    onVaeNodeSelect,
    selectedTopicId,
    selectedVaeNodeAssignedTopicId,
    selectedVaeNodeId,
  } = useRpbVaeNodeUrlState();

  return (
    <>
      <span data-testid="selected-vae-node">{selectedVaeNodeId}</span>
      <span data-testid="selected-topic">{selectedTopicId ?? 'no-topic'}</span>
      <span data-testid="selected-assigned-topic">
        {selectedVaeNodeAssignedTopicId ?? 'no-assigned-topic'}
      </span>
      <span data-testid="expanded-node-ids">{expandedNodeIds.join(',')}</span>
      <button type="button" onClick={() => onVaeNodeSelect('root')}>
        select-root
      </button>
      <button type="button" onClick={() => onVaeNodeSelect('grandchild')}>
        select-grandchild
      </button>
      <button type="button" onClick={() => onVaeNodeSelect('topicless-root')}>
        select-topicless-root
      </button>
      <button type="button" onClick={() => toggleOutlineNodeChecked('root')}>
        toggle-root
      </button>
      <button
        type="button"
        onClick={() => toggleOutlineNodeChecked('topicless-root')}
      >
        toggle-topicless-root
      </button>
      <button
        type="button"
        onClick={() => toggleOutlineNodeChecked('grandchild')}
      >
        toggle-grandchild
      </button>
      <button
        type="button"
        onClick={() => toggleOutlineNodeChecked('root', true)}
      >
        approve-root-with-snapshotted-right
      </button>
    </>
  );
};

const OutlineCheckabilityProbe = () => {
  const { canToggleOutlineNodeChecked } = useRpbOutlineCheckState();
  // eslint-disable-next-line no-restricted-syntax -- test-only click probe for verifying post-render permission lookups
  const [probeResult, setProbeResult] = useState('');

  return (
    <>
      <span data-testid="can-toggle-root">
        {String(canToggleOutlineNodeChecked('root'))}
      </span>
      <span data-testid="can-toggle-grandchild">
        {String(canToggleOutlineNodeChecked('grandchild'))}
      </span>
      <span data-testid="can-toggle-topicless-root">
        {String(canToggleOutlineNodeChecked('topicless-root'))}
      </span>
      <button
        type="button"
        onClick={() =>
          setProbeResult(
            [
              canToggleOutlineNodeChecked('root'),
              canToggleOutlineNodeChecked('grandchild'),
              canToggleOutlineNodeChecked('missing-node'),
            ].join(','),
          )
        }
      >
        probe-checkability
      </button>
      <span data-testid="checkability-probe-result">{probeResult}</span>
    </>
  );
};

const OutlineCheckedStateProbe = () => {
  const { outlineCheckedStateById, toggleOutlineNodeChecked } =
    useRpbOutlineCheckState();

  return (
    <>
      <span data-testid="root-checked">
        {String(outlineCheckedStateById.get('root'))}
      </span>
      <button type="button" onClick={() => toggleOutlineNodeChecked('root')}>
        toggle-root
      </button>
    </>
  );
};

const outlineTreeRenderMock = vi.fn();

const OutlineTreeRenderProbe = () => {
  const { outlineTree } = useRpbOutlineTreeState();
  outlineTreeRenderMock(outlineTree);

  return <span data-testid="outline-tree-size">{outlineTree.length}</span>;
};

const StableChildProviderProbe = () => {
  // eslint-disable-next-line no-restricted-syntax -- test-only rerender trigger for verifying context fanout without URL state
  const [, setRenderVersion] = useState(0);
  const child = useMemo(() => <OutlineTreeRenderProbe />, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setRenderVersion((version) => version + 1)}
      >
        rerender-provider
      </button>
      <RpbOutlineProvider>{child}</RpbOutlineProvider>
    </>
  );
};

describe('RpbOutlineContext', () => {
  afterEach(cleanup);

  beforeEach(() => {
    routeSearch = {};
    window.sessionStorage.clear();
    mocks.navigateMock.mockReset();
    mocks.transactMock.mockClear();
    mocks.updateMock.mockReset();
    mocks.useNodesByTypeMock.mockReset();
    mocks.hasTopicMutationRightsMock.mockReset();
    mocks.hasTopicMutationRightsMock.mockReturnValue(true);
    outlineTreeRenderMock.mockReset();
    mocks.canApproveFinalDecision = false;
    mocks.canMutateProject = false;
  });

  it('clears stale outline route state without overwriting the selected topic', () => {
    routeSearch = {
      outlineNodeId: 'grandchild',
      topicId: 'topic-child',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: [],
    });

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    expect(screen.getByTestId('selected-topic').textContent).toBe(
      'topic-child',
    );
    expect(mocks.navigateMock).toHaveBeenCalledTimes(1);

    const [{ replace, search }] = mocks.navigateMock.mock.calls[0] as [
      {
        replace: boolean;
        search: (prev: typeof routeSearch) => typeof routeSearch;
      },
    ];

    expect(replace).toBe(true);
    expect(search(routeSearch)).toEqual({
      outlineNodeId: '',
      topicId: 'topic-child',
    });
  });

  it('normalizes a stale outline route state without changing the selected topic', () => {
    routeSearch = {
      amendmentDialogRowId: 'row-1',
      gesetzId: 'old-law',
      outlineNodeId: 'missing-node',
      previewDocumentId: 'doc-1',
      satzId: 'satz-1',
      selectedFundstelleId: 'fund-1',
      showNormtext: true,
      tbmId: 'tbm-1',
      topicId: 'old-topic',
      topicNormId: 'norm-1',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: nodes,
      isLoading: false,
    });

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    expect(mocks.navigateMock).toHaveBeenCalledTimes(1);

    const [{ replace, search }] = mocks.navigateMock.mock.calls[0] as [
      {
        replace: boolean;
        search: (prev: typeof routeSearch) => typeof routeSearch;
      },
    ];

    expect(replace).toBe(true);
    expect(search(routeSearch)).toEqual({
      amendmentDialogRowId: 'row-1',
      gesetzId: 'old-law',
      outlineNodeId: 'root',
      previewDocumentId: 'doc-1',
      satzId: 'satz-1',
      selectedFundstelleId: 'fund-1',
      showNormtext: true,
      tbmId: 'tbm-1',
      topicId: 'old-topic',
      topicNormId: 'norm-1',
    });
  });

  it('keeps a manual topic selection even when the outline points at another topic', () => {
    routeSearch = {
      outlineNodeId: 'root',
      topicId: 'topic-child',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: nodes,
    });

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    expect(screen.getByTestId('selected-vae-node').textContent).toBe('root');
    expect(screen.getByTestId('selected-topic').textContent).toBe(
      'topic-child',
    );
    expect(mocks.navigateMock).not.toHaveBeenCalled();
  });

  it('keeps outline tree consumers stable for text-only vae_node updates', () => {
    routeSearch = {
      outlineNodeId: 'root',
      topicId: 'topic-root',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: nodes,
    });

    render(<StableChildProviderProbe />);

    expect(outlineTreeRenderMock).toHaveBeenCalledTimes(1);

    const rootNode = nodes.find((node) => node.id === 'root');
    if (!rootNode) {
      throw new Error('Test fixture is missing root node');
    }

    mocks.useNodesByTypeMock.mockReturnValue({
      data: [
        {
          ...rootNode,
          text: 'Updated Beschluss body',
        },
        ...nodes.filter((node) => node.id !== 'root'),
      ],
    });

    act(() => {
      screen.getByRole('button', { name: 'rerender-provider' }).click();
    });

    expect(outlineTreeRenderMock).toHaveBeenCalledTimes(1);
  });

  it('expands ancestors and clears topic-scoped search state when selecting a node in a different topic', () => {
    routeSearch = {
      gesetzId: 'law-1',
      outlineNodeId: 'root',
      previewDocumentId: 'doc-1',
      selectedFundstelleId: 'fund-1',
      topicId: 'topic-root',
      topicNormId: 'norm-1',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: nodes,
    });

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    mocks.navigateMock.mockClear();

    act(() => {
      screen.getByRole('button', { name: 'select-grandchild' }).click();
    });

    expect(screen.getByTestId('expanded-node-ids').textContent).toBe(
      'root,child-topic',
    );
    expect(mocks.navigateMock).toHaveBeenCalledTimes(1);

    const [{ search }] = mocks.navigateMock.mock.calls[0] as [
      {
        search: (prev: typeof routeSearch) => typeof routeSearch;
      },
    ];

    expect(search(routeSearch)).toEqual({
      gesetzId: undefined,
      outlineNodeId: 'grandchild',
      previewDocumentId: undefined,
      selectedFundstelleId: undefined,
      topicId: 'topic-child',
      topicNormId: undefined,
    });
  });

  it('updates the topic selection when clicking an outline node with an attached topic', () => {
    routeSearch = {
      outlineNodeId: 'grandchild',
      topicId: 'topic-child',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: nodes,
    });

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    mocks.navigateMock.mockClear();

    act(() => {
      screen.getByRole('button', { name: 'select-root' }).click();
    });

    expect(mocks.navigateMock).toHaveBeenCalledTimes(1);

    const [{ search }] = mocks.navigateMock.mock.calls[0] as [
      {
        search: (prev: typeof routeSearch) => typeof routeSearch;
      },
    ];

    expect(search(routeSearch)).toEqual({
      outlineNodeId: 'root',
      topicId: 'topic-root',
    });
  });

  it('clears selected topic and topic-scoped state when clicking a no-topic outline node', () => {
    routeSearch = {
      aiLane: 'risikohinweise',
      outlineNodeId: 'root',
      participationSubtopicId: '__sonstige__',
      previewDocumentId: 'doc-1',
      topicId: 'topic-root',
      topicNormId: 'norm-1',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: [
        ...nodes,
        createVaeNode({
          id: 'topicless-root',
          title: 'Topicless Root',
          order: 2,
          topicId: null,
        }),
      ],
    });

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    mocks.navigateMock.mockClear();

    act(() => {
      screen.getByRole('button', { name: 'select-topicless-root' }).click();
    });

    expect(mocks.navigateMock).toHaveBeenCalledTimes(1);

    const [{ search }] = mocks.navigateMock.mock.calls[0] as [
      {
        search: (prev: typeof routeSearch) => typeof routeSearch;
      },
    ];

    expect(search(routeSearch)).toEqual({
      aiLane: 'risikohinweise',
      outlineNodeId: 'topicless-root',
      participationSubtopicId: undefined,
      previewDocumentId: undefined,
      topicId: undefined,
      topicNormId: undefined,
    });
  });

  it('exposes the selected outline assigned topic separately from manual topic selection', () => {
    routeSearch = {
      outlineNodeId: 'root',
      topicId: 'topic-child',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: nodes,
    });

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    expect(screen.getByTestId('selected-topic').textContent).toBe(
      'topic-child',
    );
    expect(screen.getByTestId('selected-assigned-topic').textContent).toBe(
      'topic-root',
    );
  });

  it('does not force the selected outline node itself into expanded state', () => {
    routeSearch = {
      outlineNodeId: 'root',
      topicId: 'topic-root',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: nodes,
    });

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    expect(screen.getByTestId('expanded-node-ids').textContent).toBe('');

    act(() => {
      screen.getByRole('button', { name: 'select-root' }).click();
    });

    expect(screen.getByTestId('expanded-node-ids').textContent).toBe('');
  });

  it('runs outline check toggles through one transaction helper update', () => {
    routeSearch = {
      outlineNodeId: 'root',
      topicId: 'topic-root',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: nodes,
    });

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    act(() => {
      screen.getByRole('button', { name: 'toggle-root' }).click();
    });

    expect(mocks.transactMock).toHaveBeenCalledTimes(1);
    expect(mocks.updateMock).toHaveBeenCalledTimes(1);
    expect(mocks.updateMock.mock.calls[0]?.[0]).toMatchObject({ id: 'root' });
  });

  it('precomputes effective topic checkability and serves later permission probes from the lookup', () => {
    routeSearch = {
      outlineNodeId: 'grandchild',
      topicId: 'topic-child',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: nodes,
    });

    render(
      <RpbOutlineProvider>
        <OutlineCheckabilityProbe />
      </RpbOutlineProvider>,
    );

    expect(mocks.hasTopicMutationRightsMock).toHaveBeenCalledTimes(2);
    expect(mocks.hasTopicMutationRightsMock).toHaveBeenCalledWith('topic-root');
    expect(mocks.hasTopicMutationRightsMock).toHaveBeenCalledWith(
      'topic-child',
    );
    expect(screen.getByTestId('can-toggle-root').textContent).toBe('true');
    expect(screen.getByTestId('can-toggle-grandchild').textContent).toBe(
      'true',
    );

    mocks.hasTopicMutationRightsMock.mockClear();

    act(() => {
      screen.getByRole('button', { name: 'probe-checkability' }).click();
    });

    expect(screen.getByTestId('checkability-probe-result').textContent).toBe(
      'true,true,false',
    );
    expect(mocks.hasTopicMutationRightsMock).not.toHaveBeenCalled();
  });

  it('does not run outline check updates without topic mutation rights', () => {
    routeSearch = {
      outlineNodeId: 'root',
      topicId: 'topic-root',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: nodes,
    });
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    mocks.hasTopicMutationRightsMock.mockClear();

    act(() => {
      screen.getByRole('button', { name: 'toggle-root' }).click();
    });

    expect(mocks.hasTopicMutationRightsMock).not.toHaveBeenCalled();
    expect(mocks.transactMock).not.toHaveBeenCalled();
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  it('runs outline check updates using inherited topic checkability', () => {
    routeSearch = {
      outlineNodeId: 'grandchild',
      topicId: 'topic-child',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: nodes,
    });

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    mocks.hasTopicMutationRightsMock.mockClear();

    act(() => {
      screen.getByRole('button', { name: 'toggle-grandchild' }).click();
    });

    expect(mocks.hasTopicMutationRightsMock).not.toHaveBeenCalled();
    expect(mocks.transactMock).toHaveBeenCalledTimes(1);
    expect(mocks.updateMock).toHaveBeenCalledTimes(1);
    expect(mocks.updateMock.mock.calls[0]?.[0]).toMatchObject({
      id: 'grandchild',
    });
  });

  it('allows project mutators to check topic-less outline nodes', () => {
    routeSearch = {
      outlineNodeId: 'topicless-root',
    };
    mocks.canMutateProject = true;
    mocks.useNodesByTypeMock.mockReturnValue({
      data: [
        createVaeNode({
          id: 'topicless-root',
          title: 'Topicless Root',
          order: 1,
          topicId: null,
        }),
      ],
    });
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    mocks.hasTopicMutationRightsMock.mockClear();

    act(() => {
      screen.getByRole('button', { name: 'toggle-topicless-root' }).click();
    });

    expect(mocks.hasTopicMutationRightsMock).not.toHaveBeenCalled();
    expect(mocks.transactMock).toHaveBeenCalledTimes(1);
    expect(mocks.updateMock).toHaveBeenCalledTimes(1);
    expect(mocks.updateMock.mock.calls[0]?.[0]).toMatchObject({
      id: 'topicless-root',
    });
  });

  it('does not check topic-less outline nodes without project mutation rights', () => {
    routeSearch = {
      outlineNodeId: 'topicless-root',
    };
    mocks.useNodesByTypeMock.mockReturnValue({
      data: [
        createVaeNode({
          id: 'topicless-root',
          title: 'Topicless Root',
          order: 1,
          topicId: null,
        }),
      ],
    });
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    mocks.hasTopicMutationRightsMock.mockClear();

    act(() => {
      screen.getByRole('button', { name: 'toggle-topicless-root' }).click();
    });

    expect(mocks.hasTopicMutationRightsMock).not.toHaveBeenCalled();
    expect(mocks.transactMock).not.toHaveBeenCalled();
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  // NOTE: The confirmation dialog flow (dialog appears on mark, Cancel reverts,
  // Confirm calls toggle) is an OutlineNodeItem UI concern and should be
  // covered by an OutlineNodeItem component test.

  // These tests verify the update recipe directly. A complementary integration test
  // reading outlineCheckedStateById post-toggle would provide end-to-end coverage.
  it('flips checked_by_assignee when the current user cannot approve final decision', () => {
    routeSearch = { outlineNodeId: 'root', topicId: 'topic-root' };
    mocks.useNodesByTypeMock.mockReturnValue({ data: nodes });
    mocks.canApproveFinalDecision = false;

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    act(() => {
      screen.getByRole('button', { name: 'toggle-root' }).click();
    });

    const recipe = mocks.updateMock.mock.calls[0]?.[1] as (
      draft: NodePayloadByType<'vae_node'>,
    ) => void;
    const draft = createVaeNode({
      id: 'root',
      title: 'Root',
      checkedByAssignee: false,
      checkedByLeader: false,
    });
    recipe(draft);

    expect(draft.checkedByAssignee).toBe(true);
    expect(draft.checkedByLeader).toBe(false);
  });

  it('clears checked_by_leader when assignee revokes a previously-approved completion', () => {
    routeSearch = { outlineNodeId: 'root', topicId: 'topic-root' };
    mocks.useNodesByTypeMock.mockReturnValue({ data: nodes });
    mocks.canApproveFinalDecision = false;

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    act(() => {
      screen.getByRole('button', { name: 'toggle-root' }).click();
    });

    const recipe = mocks.updateMock.mock.calls[0]?.[1] as (
      draft: NodePayloadByType<'vae_node'>,
    ) => void;
    const draft = createVaeNode({
      // Pre-revocation state: assignee completed, leader approved.
      id: 'root',
      title: 'Root',
      checkedByAssignee: true,
      checkedByLeader: true,
    });
    recipe(draft);

    expect(draft.checkedByAssignee).toBe(false);
    expect(draft.checkedByLeader).toBe(false);
  });

  it('does not touch checked_by_leader when assignee marks a chapter done', () => {
    routeSearch = { outlineNodeId: 'root', topicId: 'topic-root' };
    mocks.useNodesByTypeMock.mockReturnValue({ data: nodes });
    mocks.canApproveFinalDecision = false;

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    act(() => {
      screen.getByRole('button', { name: 'toggle-root' }).click();
    });

    const recipe = mocks.updateMock.mock.calls[0]?.[1] as (
      draft: NodePayloadByType<'vae_node'>,
    ) => void;
    const draft = createVaeNode({
      id: 'root',
      title: 'Root',
      checkedByAssignee: false,
      checkedByLeader: false,
    });
    recipe(draft);

    expect(draft.checkedByAssignee).toBe(true);
    expect(draft.checkedByLeader).toBe(false);
  });

  it('does not trust a stale final-decision action snapshot as authorization', () => {
    routeSearch = { outlineNodeId: 'root', topicId: 'topic-root' };
    mocks.useNodesByTypeMock.mockReturnValue({ data: nodes });
    mocks.canApproveFinalDecision = false;

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    act(() => {
      screen
        .getByRole('button', { name: 'approve-root-with-snapshotted-right' })
        .click();
    });

    expect(mocks.transactMock).not.toHaveBeenCalled();
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  it('flips checked_by_leader when the current user can approve final decision', () => {
    routeSearch = { outlineNodeId: 'root', topicId: 'topic-root' };
    mocks.useNodesByTypeMock.mockReturnValue({ data: nodes });
    mocks.canApproveFinalDecision = true;
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    expect(mocks.hasTopicMutationRightsMock).not.toHaveBeenCalled();

    act(() => {
      screen.getByRole('button', { name: 'toggle-root' }).click();
    });

    const recipe = mocks.updateMock.mock.calls[0]?.[1] as (
      draft: NodePayloadByType<'vae_node'>,
    ) => void;
    const draft = createVaeNode({
      id: 'root',
      title: 'Root',
      checkedByAssignee: false,
      checkedByLeader: false,
    });
    recipe(draft);

    expect(draft.checkedByAssignee).toBe(false);
    expect(draft.checkedByLeader).toBe(true);
  });

  it('only clears checked_by_leader when the current user revokes final decision approval', () => {
    routeSearch = { outlineNodeId: 'root', topicId: 'topic-root' };
    mocks.useNodesByTypeMock.mockReturnValue({ data: nodes });
    mocks.canApproveFinalDecision = true;

    render(
      <RpbOutlineProvider>
        <OutlineProbe />
      </RpbOutlineProvider>,
    );

    act(() => {
      screen.getByRole('button', { name: 'toggle-root' }).click();
    });

    const recipe = mocks.updateMock.mock.calls[0]?.[1] as (
      draft: NodePayloadByType<'vae_node'>,
    ) => void;
    const draft = createVaeNode({
      id: 'root',
      title: 'Root',
      checkedByAssignee: true,
      checkedByLeader: true,
    });
    recipe(draft);

    expect(draft.checkedByAssignee).toBe(true);
    expect(draft.checkedByLeader).toBe(false);
  });

  it('reflects a persisted assignee toggle in provider checked state after rerender', () => {
    routeSearch = { outlineNodeId: 'root', topicId: 'topic-root' };
    let persistedNodes = nodes;
    mocks.useNodesByTypeMock.mockImplementation(() => ({
      data: persistedNodes,
    }));
    mocks.canApproveFinalDecision = false;

    const { rerender } = render(
      <RpbOutlineProvider>
        <OutlineCheckedStateProbe />
      </RpbOutlineProvider>,
    );

    expect(screen.getByTestId('root-checked').textContent).toBe('false');

    act(() => {
      screen.getByRole('button', { name: 'toggle-root' }).click();
    });

    const recipe = mocks.updateMock.mock.calls[0]?.[1] as (
      draft: NodePayloadByType<'vae_node'>,
    ) => void;
    persistedNodes = persistedNodes.map((node) => {
      if (node.id !== 'root') {
        return node;
      }

      const draft = createVaeNode(node);
      recipe(draft);
      return draft;
    });
    rerender(
      <RpbOutlineProvider>
        <OutlineCheckedStateProbe />
      </RpbOutlineProvider>,
    );

    expect(screen.getByTestId('root-checked').textContent).toBe('true');
  });

  it('reflects checked_by_leader state in outlineCheckedStateById for final decision approval', () => {
    routeSearch = { outlineNodeId: 'root', topicId: 'topic-root' };
    const rootNode = nodes.find((n) => n.id === 'root');
    if (!rootNode) {
      throw new Error('Test fixture is missing root node');
    }
    const partiallyDoneNodes = [
      ...nodes.filter((n) => n.id !== 'root'),
      {
        ...rootNode,
        checkedByAssignee: true,
        checkedByLeader: false,
      },
    ] satisfies NodePayloadByType<'vae_node'>[];
    mocks.useNodesByTypeMock.mockReturnValue({ data: partiallyDoneNodes });
    mocks.canApproveFinalDecision = true;

    const { result } = renderHook(() => useRpbOutlineCheckState(), {
      wrapper: (props) => {
        const { children } = props;

        return <RpbOutlineProvider>{children}</RpbOutlineProvider>;
      },
    });

    expect(result.current.outlineCheckedStateById.get('root')).toBe(false);
  });
});
