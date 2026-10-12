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
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'nodeType'>,
): NodeSummary => ({
  frontendParentIds: [],
  parents: [],
  ...overrides,
});

const makeTopic = (id: string, name: string) =>
  ({
    compositeKey: `topic:${id}` as CompositeKey,
    id,
    nodeType: 'topic',
    name,
    description: null,
    parentTopicId: null,
    mvpAssignee: null,
    mvpAssignees: [],
    showInMvp: true,
    showInEwm: true,
    showInBeschluss: true,
    projectId: 'project-1',
    isDeleted: false,
    frontendParentIds: [],
    updateType: null,
    createdAt: '',
    updatedAt: '',
  }) as unknown as EwmsTopicNode;

const makeSubtopic = (id: string, name: string, topicId: string) =>
  ({
    compositeKey: `subtopic:${id}` as CompositeKey,
    id,
    nodeType: 'subtopic',
    name,
    description: null,
    topicId: topicId,
    showInMvp: true,
    showInEwm: true,
    showInBeschluss: true,
    projectId: 'project-1',
    isDeleted: false,
    frontendParentIds: [],
    updateType: null,
    createdAt: '',
    updatedAt: '',
  }) satisfies EwmsSubtopicNode;

describe('buildEwmsSubtopicOptionsByTopic', () => {
  it('builds select options from graph descendants of each topic', () => {
    const topic1 = makeTopic('topic-1', 'Topic 1');
    const topic2 = makeTopic('topic-2', 'Topic 2');
    const index = buildProjectNodeIndex([
      createSummary({ id: topic1.id, nodeType: 'topic' }),
      createSummary({ id: topic2.id, nodeType: 'topic' }),
      createSummary({
        id: 'subtopic-b',
        nodeType: 'subtopic',
        parents: [{ id: topic1.id, nodeType: 'topic' }],
      }),
      createSummary({
        id: 'subtopic-a',
        nodeType: 'subtopic',
        parents: [{ id: topic1.id, nodeType: 'topic' }],
      }),
      createSummary({
        id: 'subtopic-c',
        nodeType: 'subtopic',
        parents: [{ id: topic2.id, nodeType: 'topic' }],
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
      createSummary({ id: topic.id, nodeType: 'topic' }),
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
