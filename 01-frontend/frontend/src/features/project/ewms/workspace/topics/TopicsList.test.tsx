import type { CompositeKey } from '@/db/nodes/compositeKey';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EwmsArgumentNode, EwmsTopicNode } from '../../data/ewms.nodes';
import { EWMS_UNASSIGNED_SUBTOPIC_SELECTION } from '../../data/ewmsSubtopicSelection';
import { TopicsList } from './TopicsList';

const mocks = vi.hoisted(() => ({
  subtopicItemsByTopicId: new Map<string, { label: string; value: string }[]>(),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { count?: number; name?: string }) => {
      if (key === 'topics.unassignedSubtopic') {
        return 'Kein Unterthema';
      }

      if (values?.name) {
        return `${key}:${values.name}`;
      }

      if (values?.count !== undefined) {
        return `${values.count} Argumente`;
      }

      return key;
    },
  }),
}));

vi.mock('../EwmsSubtopicsContext', () => ({
  useEwmsSubtopics: () => ({
    getSubtopicItemsForTopic: (topicId: string | null | undefined) =>
      topicId ? (mocks.subtopicItemsByTopicId.get(topicId) ?? []) : [],
  }),
}));

afterEach(() => {
  mocks.subtopicItemsByTopicId.clear();
  cleanup();
});

const makeTopic = (id: string, name: string) =>
  ({
    compositeKey: `topic:${id}` as CompositeKey,
    id,
    node_type: 'topic',
    name,
    description: null,
    parent_topic_id: null,
    mvp_assignee: null,
    mvp_assignees: [],
    show_in_mvp: true,
    show_in_ewm: true,
    show_in_beschluss: true,
    project_id: 'project-1',
    is_deleted: false,
    frontend_parent_ids: [],
    update_type: null,
    created_at: '',
    updated_at: '',
    sys_period: null,
  }) as unknown as EwmsTopicNode;

const makeArgument = (id: string, subtopicId: string | null) =>
  ({
    compositeKey: `argument:${id}` as CompositeKey,
    id,
    node_type: 'argument',
    beteiligungs_eingang_id: 'entry-1',
    sub_topic_id: subtopicId,
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
    argument_id: id,
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

const renderTopicsList = (props: {
  expandedTopicGroupId?: string;
  selectedSubtopicId?: string;
  selectedTopicId?: string;
  topics?: EwmsTopicNode[];
  onSelectSubtopic?: (topicId: string, subtopicId: string) => void;
}) => {
  const {
    expandedTopicGroupId = 'topic-1',
    selectedSubtopicId,
    selectedTopicId = 'topic-1',
    topics = [makeTopic('topic-1', 'Immissionen')],
    onSelectSubtopic = () => undefined,
  } = props;

  return render(
    <TopicsList
      topics={topics}
      argumentsList={[
        makeArgument('argument-1', null),
        makeArgument('argument-2', 'subtopic-1'),
      ]}
      expandedTopicGroupId={expandedTopicGroupId}
      selectedSubtopicId={selectedSubtopicId}
      selectedTopicId={selectedTopicId}
      onExpandTopicGroup={() => undefined}
      onSelectSubtopic={onSelectSubtopic}
      onSelectTopic={() => undefined}
    />,
  );
};

describe('TopicsList', () => {
  it('shows the unassigned subtopic row first for expandable topics', () => {
    mocks.subtopicItemsByTopicId.set('topic-1', [
      { value: 'subtopic-1', label: 'Verkehrslärm' },
    ]);

    renderTopicsList({
      selectedSubtopicId: EWMS_UNASSIGNED_SUBTOPIC_SELECTION,
    });

    const topicButton = screen.getByRole('button', {
      name: 'topics.selectLabel:Immissionen',
    });
    const unassignedButton = screen.getByRole('button', {
      name: 'topics.selectSubtopicLabel:Kein Unterthema',
    });
    const subtopicButton = screen.getByRole('button', {
      name: 'topics.selectSubtopicLabel:Verkehrslärm',
    });

    expect(topicButton.getAttribute('aria-pressed')).toBe('false');
    expect(unassignedButton.getAttribute('aria-pressed')).toBe('true');
    expect(subtopicButton.compareDocumentPosition(unassignedButton)).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    );
  });

  it('selects the explicit unassigned subtopic bucket', () => {
    const onSelectSubtopic = vi.fn();
    mocks.subtopicItemsByTopicId.set('topic-1', [
      { value: 'subtopic-1', label: 'Verkehrslärm' },
    ]);

    renderTopicsList({ onSelectSubtopic });

    fireEvent.click(
      screen.getByRole('button', {
        name: 'topics.selectSubtopicLabel:Kein Unterthema',
      }),
    );

    expect(onSelectSubtopic).toHaveBeenCalledWith(
      'topic-1',
      EWMS_UNASSIGNED_SUBTOPIC_SELECTION,
    );
  });

  it('does not mark the same sentinel subtopic active under another expanded topic', () => {
    mocks.subtopicItemsByTopicId.set('topic-1', [
      { value: 'subtopic-1', label: 'Verkehrslärm' },
    ]);
    mocks.subtopicItemsByTopicId.set('topic-2', [
      { value: 'subtopic-2', label: 'Artenschutz' },
    ]);

    renderTopicsList({
      expandedTopicGroupId: 'topic-2',
      selectedSubtopicId: EWMS_UNASSIGNED_SUBTOPIC_SELECTION,
      selectedTopicId: 'topic-1',
      topics: [
        makeTopic('topic-1', 'Immissionen'),
        makeTopic('topic-2', 'Naturschutz'),
      ],
    });

    const unassignedButtons = screen.getAllByRole('button', {
      name: 'topics.selectSubtopicLabel:Kein Unterthema',
    });
    const activeUnassignedButtons = unassignedButtons.filter(
      (button) => button.getAttribute('aria-pressed') === 'true',
    );

    expect(unassignedButtons).toHaveLength(2);
    expect(activeUnassignedButtons).toHaveLength(1);
  });
});
