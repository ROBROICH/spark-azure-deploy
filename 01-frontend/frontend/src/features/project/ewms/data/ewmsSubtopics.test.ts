import type { CompositeKey } from '@/db/nodes/compositeKey';
import { buildProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import type { NodeSummary } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import type { EwmsTopicNode } from './ewms.nodes';
import {
  buildEwmsSubtopicOptionsByTopic,
  type EwmsSubtopicNode,
} from './ewmsSubtopics';

const createSummary = (
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'node_type'>,
): NodeSummary => ({
  frontend_parent_ids: [],
  parents: [],
  ...overrides,
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

const makeSubtopic = (id: string, name: string, topicId: string) =>
  ({
    compositeKey: `subtopic:${id}` as CompositeKey,
    id,
    node_type: 'subtopic',
    name,
    description: null,
    topic_id: topicId,
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
  }) satisfies EwmsSubtopicNode;

describe('buildEwmsSubtopicOptionsByTopic', () => {
  it('builds select options from graph descendants of each topic', () => {
    const topic1 = makeTopic('topic-1', 'Topic 1');
    const topic2 = makeTopic('topic-2', 'Topic 2');
    const index = buildProjectNodeIndex([
      createSummary({ id: topic1.id, node_type: 'topic' }),
      createSummary({ id: topic2.id, node_type: 'topic' }),
      createSummary({
        id: 'subtopic-b',
        node_type: 'subtopic',
        parents: [{ id: topic1.id, node_type: 'topic' }],
      }),
      createSummary({
        id: 'subtopic-a',
        node_type: 'subtopic',
        parents: [{ id: topic1.id, node_type: 'topic' }],
      }),
      createSummary({
        id: 'subtopic-c',
        node_type: 'subtopic',
        parents: [{ id: topic2.id, node_type: 'topic' }],
      }),
    ]);

    const optionsByTopicId = buildEwmsSubtopicOptionsByTopic(
      index,
      [topic1, topic2],
      [
        makeSubtopic('subtopic-b', 'Boden', topic1.id),
        makeSubtopic('subtopic-a', 'Artenschutz', topic1.id),
        makeSubtopic('subtopic-c', 'Denkmalschutz', topic2.id),
      ],
    );

    expect(optionsByTopicId.get(topic1.id)).toEqual([
      { value: 'subtopic-a', label: 'Artenschutz' },
      { value: 'subtopic-b', label: 'Boden' },
    ]);
    expect(optionsByTopicId.get(topic2.id)).toEqual([
      { value: 'subtopic-c', label: 'Denkmalschutz' },
    ]);
  });

  it('uses the payload topic id when a loaded subtopic has no graph edge', () => {
    const topic = makeTopic('topic-1', 'Topic 1');
    const index = buildProjectNodeIndex([
      createSummary({ id: topic.id, node_type: 'topic' }),
    ]);

    const optionsByTopicId = buildEwmsSubtopicOptionsByTopic(
      index,
      [topic],
      [makeSubtopic('subtopic-orphan', 'Orphan', topic.id)],
    );

    expect(optionsByTopicId.get(topic.id)).toEqual([
      { value: 'subtopic-orphan', label: 'Orphan' },
    ]);
  });
});
