import '@testing-library/jest-dom/vitest';
import type { CompositeKey } from '@/db/nodes/compositeKey';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EwmsArgumentNode, EwmsTopicNode } from '../data/ewms.nodes';
import { ArgumentDetailView } from './ArgumentDetailView';

const mocks = vi.hoisted(() => ({
  argument: null as EwmsArgumentNode | null,
  canMutateProject: true,
  hasTopicMutationRights: vi.fn(() => true),
  trackPersistenceForNodeSummaryRefetch: vi.fn(),
  transact: vi.fn(),
  update: vi.fn(),
}));

type ToolbarProps = {
  onAcceptClassification: () => void;
  onRejectClassification: () => void;
  onSubtopicIdChange: (value: string) => void;
  onTopicIdChange: (value: string) => void;
};

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNode: () => ({ data: mocks.argument }),
}));

vi.mock('../workspace/EwmsSubtopicsContext', () => ({
  useEwmsSubtopics: () => ({
    getSubtopicItemsForTopic: () => [],
    trackPersistenceForNodeSummaryRefetch:
      mocks.trackPersistenceForNodeSummaryRefetch,
  }),
}));

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({
      canMutateProject: mocks.canMutateProject,
    }),
  }),
);

vi.mock(
  '@/features/access-control/topic-permissions/hasTopicMutationRights',
  () => ({
    useHasTopicMutationRights: () => mocks.hasTopicMutationRights,
  }),
);

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    transact: mocks.transact,
    update: mocks.update,
  }),
}));

vi.mock('./ArgumentDetailContent', () => ({
  ArgumentDetailContent: () => <div data-testid="argument-detail-content" />,
}));

vi.mock('./TopicClassificationToolbar', () => ({
  TopicClassificationToolbar: (props: ToolbarProps) => (
    <div>
      <button type="button" onClick={() => props.onTopicIdChange('topic-2')}>
        topic
      </button>
      <button
        type="button"
        onClick={() => props.onSubtopicIdChange('subtopic-2')}
      >
        subtopic
      </button>
      <button type="button" onClick={props.onRejectClassification}>
        reject
      </button>
      <button type="button" onClick={props.onAcceptClassification}>
        accept
      </button>
    </div>
  ),
}));

const makeArgument = () =>
  ({
    compositeKey: 'argument:argument-1' as CompositeKey,
    id: 'argument-1',
    node_type: 'argument',
    beteiligungs_eingang_id: 'entry-1',
    sub_topic_id: null,
    topic_id: 'topic-1',
    status: 'open',
    text: 'Argument text',
    start_idx: null,
    end_idx: null,
    erwiderung: null,
    einordnung: null,
    context: null,
    context_start_idx: null,
    context_end_idx: null,
    argument_id: 'EXAMPLE-ARG-1',
    in_vae: false,
    is_valid_argument: true,
    project_id: 'project-1',
    is_deleted: false,
    frontend_parent_ids: [],
    update_type: null,
    created_at: '',
    updated_at: '',
    sys_period: null,
  }) satisfies EwmsArgumentNode;

const topics = [
  {
    compositeKey: 'topic:topic-1' as CompositeKey,
    id: 'topic-1',
    node_type: 'topic',
    name: 'Topic 1',
    description: null,
    parent_topic_id: null,
    mvp_assignee: null,
    mvp_assignees: [],
    rpb_assignee: null,
    rpb_assignees: [],
    show_in_beschluss: true,
    show_in_ewm: true,
    show_in_mvp: true,
    project_id: 'project-1',
    is_deleted: false,
    frontend_parent_ids: [],
    update_type: null,
    created_at: '',
    updated_at: '',
    sys_period: null,
  },
] satisfies EwmsTopicNode[];

const renderArgumentDetailView = () =>
  render(
    <ArgumentDetailView
      argumentRef={{ id: 'argument-1', node_type: 'argument' }}
      topics={topics}
      onBack={() => undefined}
    />,
  );

describe('ArgumentDetailView node summary refetch tracking', () => {
  beforeEach(() => {
    const tx = {
      isPersisted: {
        promise: Promise.resolve(),
      },
    };
    mocks.argument = makeArgument();
    mocks.canMutateProject = true;
    mocks.hasTopicMutationRights.mockReset();
    mocks.hasTopicMutationRights.mockReturnValue(true);
    mocks.trackPersistenceForNodeSummaryRefetch.mockReset();
    mocks.transact.mockReset();
    mocks.transact.mockImplementation((callback: () => void) => {
      callback();
      return tx;
    });
    mocks.update.mockReset();
    mocks.update.mockImplementation(
      (_node: EwmsArgumentNode, updater: (draft: EwmsArgumentNode) => void) => {
        if (mocks.argument) {
          updater(mocks.argument);
        }
      },
    );
  });

  afterEach(cleanup);

  it('tracks topic classification persistence', async () => {
    renderArgumentDetailView();

    await userEvent.click(screen.getByRole('button', { name: 'topic' }));

    const tx = mocks.transact.mock.results[0]?.value;
    expect(mocks.trackPersistenceForNodeSummaryRefetch).toHaveBeenCalledWith(
      tx.isPersisted.promise,
    );
  });

  it('tracks subtopic classification persistence', async () => {
    renderArgumentDetailView();

    await userEvent.click(screen.getByRole('button', { name: 'subtopic' }));

    const tx = mocks.transact.mock.results[0]?.value;
    expect(mocks.trackPersistenceForNodeSummaryRefetch).toHaveBeenCalledWith(
      tx.isPersisted.promise,
    );
  });

  it('tracks rejected classification persistence', async () => {
    renderArgumentDetailView();

    await userEvent.click(screen.getByRole('button', { name: 'reject' }));

    const tx = mocks.transact.mock.results[0]?.value;
    expect(mocks.trackPersistenceForNodeSummaryRefetch).toHaveBeenCalledWith(
      tx.isPersisted.promise,
    );
  });

  it('does not track accepted classification persistence', async () => {
    renderArgumentDetailView();

    await userEvent.click(screen.getByRole('button', { name: 'accept' }));

    expect(mocks.trackPersistenceForNodeSummaryRefetch).not.toHaveBeenCalled();
  });
});
