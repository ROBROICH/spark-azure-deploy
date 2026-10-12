import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeschlussSection } from '../rpbBeschluss.types';
import { BeschlussSwimlane } from './BeschlussSwimlane';

const mocks = vi.hoisted(() => ({
  canExportBeschluss: false,
  canMutateProject: false,
  hasTopicMutationRightsMock: vi.fn(),
  selectedVaeNodeAssignedTopicId: 'topic-1' as string | undefined,
  selectedVaeNodeId: 'root',
  transactMock: vi.fn((callback: () => void) => {
    callback();
    return {
      isPersisted: {
        promise: Promise.resolve(),
      },
    };
  }),
  trackBeschlussCommitMock: vi.fn(),
  updateMock: vi.fn(),
  useNodesByTypeMock: vi.fn(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/db/nodes/hooks/useNodesByType', () => ({
  useNodesByType: (nodeType: string) => mocks.useNodesByTypeMock(nodeType),
}));

vi.mock('@/db/nodes/hooks/useLiveNodes', () => ({
  useLiveNode: (ref: { id: string } | null) => {
    const topics = mocks.useNodesByTypeMock('topic').data as {
      id: string;
      mvpAssignees: string[];
    }[];

    return {
      data: ref ? (topics.find((topic) => topic.id === ref.id) ?? null) : null,
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
        params.requiredLevel === 'owner'
          ? mocks.canExportBeschluss
          : mocks.canMutateProject,
    }),
  }),
);

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    transact: mocks.transactMock,
    update: mocks.updateMock,
  }),
}));

vi.mock('../workspace-state/RpbFeatureContext', () => ({
  useRpbFeatureContext: () => ({
    isBeschlussCommitPending: false,
    trackBeschlussCommit: mocks.trackBeschlussCommitMock,
  }),
}));

vi.mock('../workspace-state/RpbOutlineContext', () => ({
  useRpbVaeNodeUrlState: () => ({
    onVaeNodeSelect: vi.fn(),
    selectedVaeNodeAssignedTopicId: mocks.selectedVaeNodeAssignedTopicId,
    selectedVaeNodeId: mocks.selectedVaeNodeId,
  }),
}));

vi.mock(
  '@/features/access-control/topic-permissions/TopicWritePermissionBadge',
  () => ({
    TopicWritePermissionBadge: (props: { assigneeIds: string[] | null }) => (
      <span data-testid="topic-write-permission-badge">
        {props.assigneeIds === null ? 'no-topic' : props.assigneeIds.join(',')}
      </span>
    ),
  }),
);

vi.mock('./FinalizeProcedureDialog', () => ({
  FinalizeProcedureDialog: () => <div>finalize-dialog</div>,
}));

vi.mock('./BeschlussEditor', () => ({
  BeschlussEditor: (props: {
    canExport: boolean;
    headerAccessory?: ReactNode;
    onExportClick: () => void;
    onTextBlur: (outlineNodeId: string, nextText: string) => void;
    sections: BeschlussSection[];
  }) => (
    <div>
      {props.headerAccessory}
      <button
        type="button"
        disabled={!props.canExport}
        onClick={props.onExportClick}
      >
        export
      </button>
      {props.sections.map((section) => (
        <button
          key={section.vaeNodeId}
          type="button"
          data-editable={section.isEditable}
          onClick={() => props.onTextBlur(section.vaeNodeId, 'edited text')}
        >
          {section.vaeNodeId}
        </button>
      ))}
    </div>
  ),
}));

const createVaeNode = (
  overrides: Pick<NodePayloadByType<'vae_node'>, 'id' | 'title'> &
    Partial<NodePayloadByType<'vae_node'>>,
): NodePayloadByType<'vae_node'> => {
  const { id, title, ...rest } = overrides;

  return {
    assignee: null,
    canAddChild: false,
    checkedByAssignee: false,
    checkedByLeader: false,
    checkedAtAssignee: null,
    checkedAtLeader: null,
    compositeKey: toCompositeKey({ id, nodeType: 'vae_node' }),
    createdAt: '2026-01-01T00:00:00Z',
    frontendParentIds: [],
    id,
    isDeleted: false,
    isHidden: false,
    nodeType: 'vae_node',
    order: 0,
    parentVaeNodeId: null,
    projectId: 'project-1',
    subtopicId: null,
    templateId: null,
    text: 'original text',
    title,
    topicId: null,
    updateType: null,
    updatedAt: '2026-01-01T00:00:00Z',
    ...rest,
  } satisfies NodePayloadByType<'vae_node'>;
};

describe('BeschlussSwimlane', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.canExportBeschluss = false;
    mocks.canMutateProject = false;
    mocks.hasTopicMutationRightsMock.mockReset();
    mocks.hasTopicMutationRightsMock.mockReturnValue(false);
    mocks.selectedVaeNodeAssignedTopicId = 'topic-1';
    mocks.selectedVaeNodeId = 'root';
    mocks.transactMock.mockClear();
    mocks.trackBeschlussCommitMock.mockClear();
    mocks.updateMock.mockReset();
    mocks.useNodesByTypeMock.mockReset();
    mocks.useNodesByTypeMock.mockImplementation((nodeType: string) => {
      if (nodeType === 'topic') {
        return {
          data: [
            {
              id: 'topic-1',
              mvpAssignees: ['member-id'],
            },
          ],
        };
      }

      return {
        data: [
          createVaeNode({
            id: 'root',
            title: 'Root',
            topicId: 'topic-1',
          }),
          createVaeNode({
            id: 'child',
            parentVaeNodeId: 'root',
            title: 'Child',
          }),
        ],
      };
    });
  });

  it('fails closed for child VAE edits that inherit topic scope', async () => {
    const user = userEvent.setup();

    render(<BeschlussSwimlane />);

    const childButton = screen.getByRole('button', { name: 'child' });
    expect(childButton.getAttribute('data-editable')).toBe('false');

    await user.click(childButton);

    expect(mocks.hasTopicMutationRightsMock).toHaveBeenCalledWith('topic-1');
    expect(mocks.transactMock).not.toHaveBeenCalled();
    expect(mocks.trackBeschlussCommitMock).not.toHaveBeenCalled();
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  it('allows project mutators to edit topicless Beschluss sections', async () => {
    const user = userEvent.setup();
    mocks.canMutateProject = true;
    mocks.selectedVaeNodeAssignedTopicId = undefined;
    mocks.useNodesByTypeMock.mockImplementation((nodeType: string) => {
      if (nodeType === 'topic') {
        return { data: [] };
      }

      return {
        data: [
          createVaeNode({
            id: 'root',
            title: 'Root',
            topicId: null,
          }),
        ],
      };
    });

    render(<BeschlussSwimlane />);

    const rootButton = screen.getByRole('button', { name: 'root' });
    expect(rootButton.getAttribute('data-editable')).toBe('true');

    await user.click(rootButton);

    expect(mocks.transactMock).toHaveBeenCalledTimes(1);
    const tx = mocks.transactMock.mock.results[0]?.value;
    expect(mocks.trackBeschlussCommitMock).toHaveBeenCalledWith(
      tx.isPersisted.promise,
    );
    expect(mocks.updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'root' }),
      expect.any(Function),
    );

    const recipe = mocks.updateMock.mock.calls[0]?.[1] as (
      draft: NodePayloadByType<'vae_node'>,
    ) => void;
    const draft = createVaeNode({
      id: 'root',
      text: 'original text',
      title: 'Root',
      topicId: null,
    });

    recipe(draft);

    expect(draft.text).toBe('edited text');
  });

  it('does not track a commit for unchanged Beschluss text', async () => {
    const user = userEvent.setup();
    mocks.canMutateProject = true;
    mocks.selectedVaeNodeAssignedTopicId = undefined;
    mocks.useNodesByTypeMock.mockImplementation((nodeType: string) => {
      if (nodeType === 'topic') {
        return { data: [] };
      }

      return {
        data: [
          createVaeNode({
            id: 'root',
            text: 'edited text',
            title: 'Root',
            topicId: null,
          }),
        ],
      };
    });

    render(<BeschlussSwimlane />);

    await user.click(screen.getByRole('button', { name: 'root' }));

    expect(mocks.transactMock).not.toHaveBeenCalled();
    expect(mocks.trackBeschlussCommitMock).not.toHaveBeenCalled();
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  it('passes the selected inherited topic assignees to the Beschluss header badge', () => {
    render(<BeschlussSwimlane />);

    expect(
      screen.getByTestId('topic-write-permission-badge'),
    ).toHaveTextContent('member-id');
  });

  it('passes the no-topic state to the Beschluss header badge', () => {
    mocks.selectedVaeNodeAssignedTopicId = undefined;
    mocks.useNodesByTypeMock.mockImplementation((nodeType: string) => {
      if (nodeType === 'topic') {
        return { data: [] };
      }

      return {
        data: [
          createVaeNode({
            id: 'root',
            title: 'Root',
            topicId: null,
          }),
        ],
      };
    });

    render(<BeschlussSwimlane />);

    expect(
      screen.getByTestId('topic-write-permission-badge'),
    ).toHaveTextContent('no-topic');
  });

  it('keeps the export dialog disabled for non-owners', async () => {
    const user = userEvent.setup();

    render(<BeschlussSwimlane />);

    const exportButton = screen.getByRole('button', { name: 'export' });
    expect(exportButton).toBeDisabled();

    await user.click(exportButton);

    expect(screen.queryByText('finalize-dialog')).toBeNull();
  });

  it('enables export for admins and Verfahrensleitung project owners', async () => {
    const user = userEvent.setup();
    mocks.canExportBeschluss = true;

    render(<BeschlussSwimlane />);

    const exportButton = screen.getByRole('button', { name: 'export' });
    expect(exportButton).toBeEnabled();

    await user.click(exportButton);

    expect(screen.getByText('finalize-dialog')).toBeInTheDocument();
  });
});
