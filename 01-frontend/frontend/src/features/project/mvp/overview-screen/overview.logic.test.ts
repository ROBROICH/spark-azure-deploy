import type { CompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import { buildProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import {
  countTopicDocuments,
  countCompletedTopics,
  deriveTopicProgress,
  filterTopicsByAssignees,
  filterTopicsByStatus,
  groupTopicNormRefsByTopicId,
  mapInternalFundstellePresenceByTopicId,
  normalizeTopicAssigneeIds,
  resolveTopicNormsByTopicId,
  sortTopics,
  TOPIC_UNASSIGNED_FILTER_ID,
} from './overview.logic';

const timestamp = '2026-05-14T10:00:00.000Z';

const createTopic = (
  overrides: Partial<NodePayloadByType<'topic'>> &
    Pick<NodePayloadByType<'topic'>, 'id'>,
) => {
  const { id, ...rest } = overrides;
  const topic = {
    compositeKey: `topic:${id}` as CompositeKey,
    created_at: timestamp,
    description: null,
    frontend_parent_ids: [],
    id,
    is_deleted: false,
    is_outdated: false,
    mvp_assignee: null,
    mvp_assignees: [],
    name: id,
    node_type: 'topic',
    parent_topic_id: null,
    project_id: 'project-1',
    project_version: 1,
    rpb_assignee: null,
    rpb_assignees: [],
    show_in_beschluss: true,
    show_in_ewm: true,
    show_in_mvp: true,
    sys_period: null,
    update_type: null,
    updated_at: timestamp,
    ...rest,
  } satisfies NodePayloadByType<'topic'>;

  return topic;
};

const createTopicNorm = (
  overrides: Partial<NodePayloadByType<'topic_norm'>> &
    Pick<NodePayloadByType<'topic_norm'>, 'id'>,
) => {
  const { id, ...rest } = overrides;
  const topicNorm = {
    absatz: null,
    compositeKey: `topic_norm:${id}` as CompositeKey,
    created_at: timestamp,
    frontend_parent_ids: [],
    id,
    is_deleted: false,
    is_outdated: false,
    jurabk: 'BNatSchG',
    mvp_status: 'unchecked',
    node_type: 'topic_norm',
    nummer: null,
    paragraph_nr: null,
    project_id: 'project-1',
    project_version: 1,
    satz: null,
    satz_statuses: {},
    sys_period: null,
    topic_id: 'topic-1',
    type: 'pruefung',
    update_type: null,
    updated_at: timestamp,
    ...rest,
  } satisfies NodePayloadByType<'topic_norm'>;

  return topicNorm;
};

describe('overview.logic', () => {
  it('normalizes topic assignee ids to known project users in user order', () => {
    const projectUsers = [
      { userId: 'user-2' },
      { userId: 'user-1' },
      { userId: 'user-3' },
    ];

    expect(
      normalizeTopicAssigneeIds(
        ['stale-user', 'user-1', 'user-3', 'user-2'],
        projectUsers,
      ),
    ).toEqual(['user-2', 'user-1', 'user-3']);
    expect(
      normalizeTopicAssigneeIds(
        [TOPIC_UNASSIGNED_FILTER_ID, 'stale-user', 'user-1'],
        projectUsers,
      ),
    ).toEqual([TOPIC_UNASSIGNED_FILTER_ID, 'user-1']);
    expect(normalizeTopicAssigneeIds(['stale-user'], projectUsers)).toEqual([]);
    expect(normalizeTopicAssigneeIds(undefined, projectUsers)).toEqual([]);
  });

  it('derives open, in-progress, and complete topic progress from mvp_status', () => {
    expect(
      deriveTopicProgress([
        createTopicNorm({ id: 'topic-norm-1', mvp_status: 'unchecked' }),
        createTopicNorm({ id: 'topic-norm-2', mvp_status: 'unchecked' }),
      ]),
    ).toEqual({
      checkedNormCount: 0,
      totalNormCount: 2,
      status: 'open',
    });

    expect(
      deriveTopicProgress([
        createTopicNorm({ id: 'topic-norm-1', mvp_status: 'checked' }),
        createTopicNorm({ id: 'topic-norm-2', mvp_status: 'unchecked' }),
      ]),
    ).toEqual({
      checkedNormCount: 1,
      totalNormCount: 2,
      status: 'inProgress',
    });

    expect(
      deriveTopicProgress([
        createTopicNorm({ id: 'topic-norm-1', mvp_status: 'checked' }),
        createTopicNorm({ id: 'topic-norm-2', mvp_status: 'checked' }),
      ]),
    ).toEqual({
      checkedNormCount: 2,
      totalNormCount: 2,
      status: 'complete',
    });
  });

  it('groups topic norms when summary refs are confirmed by payload topic ids', () => {
    const topics = [
      createTopic({ id: 'topic-1' }),
      createTopic({ id: 'topic-2' }),
    ];
    const index = buildProjectNodeIndex([
      { id: 'topic-1', node_type: 'topic', parents: [] },
      { id: 'topic-2', node_type: 'topic', parents: [] },
      {
        id: 'topic-norm-1',
        node_type: 'topic_norm',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      },
      {
        id: 'topic-norm-2',
        node_type: 'topic_norm',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      },
      {
        id: 'topic-norm-3',
        node_type: 'topic_norm',
        parents: [{ id: 'topic-2', node_type: 'topic' }],
      },
    ]);
    const topicNorms = [
      createTopicNorm({
        id: 'topic-norm-1',
        frontend_parent_ids: ['subtopic:subtopic-1'],
        mvp_status: 'checked',
        topic_id: 'topic-1',
      }),
      createTopicNorm({
        id: 'topic-norm-2',
        frontend_parent_ids: [],
        mvp_status: 'unchecked',
        topic_id: 'topic-1',
      }),
      createTopicNorm({
        id: 'topic-norm-3',
        mvp_status: 'checked',
        topic_id: 'topic-2',
      }),
    ];
    const groupedTopicNorms = resolveTopicNormsByTopicId(
      topics,
      groupTopicNormRefsByTopicId(topics, index),
      topicNorms,
    );

    expect(
      groupedTopicNorms.get('topic-1')?.map((topicNorm) => topicNorm.id),
    ).toEqual(['topic-norm-1', 'topic-norm-2']);
    expect(
      groupedTopicNorms.get('topic-2')?.map((topicNorm) => topicNorm.id),
    ).toEqual(['topic-norm-3']);
  });

  it('ignores summary ancestry when payload topic links do not match', () => {
    const topics = [
      createTopic({ id: 'topic-1' }),
      createTopic({ id: 'topic-2' }),
    ];
    const index = buildProjectNodeIndex([
      { id: 'topic-1', node_type: 'topic', parents: [] },
      { id: 'topic-2', node_type: 'topic', parents: [] },
      {
        id: 'topic-norm-valid',
        node_type: 'topic_norm',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      },
      {
        id: 'topic-norm-stale-summary',
        node_type: 'topic_norm',
        parents: [{ id: 'topic-1', node_type: 'topic' }],
      },
    ]);
    const topicNorms = [
      createTopicNorm({
        id: 'topic-norm-valid',
        frontend_parent_ids: [],
        topic_id: 'topic-2',
        mvp_status: 'unchecked',
      }),
      createTopicNorm({
        id: 'topic-norm-stale-summary',
        frontend_parent_ids: [],
        topic_id: 'topic-2',
        mvp_status: 'checked',
      }),
    ];

    const groupedTopicNorms = resolveTopicNormsByTopicId(
      topics,
      groupTopicNormRefsByTopicId(topics, index),
      topicNorms,
    );

    expect(groupedTopicNorms.get('topic-1')).toEqual([]);
    expect(
      groupedTopicNorms.get('topic-2')?.map((topicNorm) => topicNorm.id),
    ).toEqual([]);
  });

  it('counts topic documents by graph reachability', () => {
    const topics = [
      createTopic({ id: 'topic-1' }),
      createTopic({ id: 'topic-2' }),
      createTopic({ id: 'topic-3' }),
    ];
    const index = buildProjectNodeIndex([
      { id: 'topic-1', node_type: 'topic', parents: [] },
      { id: 'topic-2', node_type: 'topic', parents: [] },
      {
        id: 'document-1',
        node_type: 'dokument',
        parents: [],
        frontend_parent_ids: ['topic:topic-1'],
      },
      {
        id: 'document-2',
        node_type: 'dokument',
        parents: [],
        frontend_parent_ids: ['topic:topic-1'],
      },
      {
        id: 'document-3',
        node_type: 'dokument',
        parents: [],
        frontend_parent_ids: ['topic:topic-2'],
      },
    ]);

    const topicDocumentCounts = countTopicDocuments(topics, index);

    expect(topicDocumentCounts.get('topic-1')).toBe(2);
    expect(topicDocumentCounts.get('topic-2')).toBe(1);
    expect(topicDocumentCounts.get('topic-3')).toBe(0);
  });

  it('maps internal fundstellen only when one fundstelle reaches a topic document and norm', () => {
    const topics = [
      createTopic({ id: 'topic-internal' }),
      createTopic({ id: 'topic-split' }),
      createTopic({ id: 'topic-external-norm' }),
      createTopic({ id: 'topic-external-document' }),
    ];
    const index = buildProjectNodeIndex([
      { id: 'topic-internal', node_type: 'topic', parents: [] },
      { id: 'topic-split', node_type: 'topic', parents: [] },
      { id: 'topic-external-norm', node_type: 'topic', parents: [] },
      { id: 'topic-external-document', node_type: 'topic', parents: [] },
      { id: 'document-external', node_type: 'dokument', parents: [] },
      { id: 'norm-external', node_type: 'norm', parents: [] },
      {
        id: 'topic-norm-internal',
        node_type: 'topic_norm',
        parents: [{ id: 'topic-internal', node_type: 'topic' }],
      },
      {
        id: 'norm-internal',
        node_type: 'norm',
        parents: [{ id: 'topic-norm-internal', node_type: 'topic_norm' }],
      },
      {
        id: 'document-internal',
        node_type: 'dokument',
        parents: [{ id: 'topic-internal', node_type: 'topic' }],
      },
      {
        id: 'fundstelle-internal',
        node_type: 'fundstelle',
        parents: [
          { id: 'document-internal', node_type: 'dokument' },
          { id: 'norm-internal', node_type: 'norm' },
        ],
      },
      {
        id: 'topic-norm-split',
        node_type: 'topic_norm',
        parents: [{ id: 'topic-split', node_type: 'topic' }],
      },
      {
        id: 'norm-split',
        node_type: 'norm',
        parents: [{ id: 'topic-norm-split', node_type: 'topic_norm' }],
      },
      {
        id: 'document-split',
        node_type: 'dokument',
        parents: [{ id: 'topic-split', node_type: 'topic' }],
      },
      {
        id: 'fundstelle-document-only',
        node_type: 'fundstelle',
        parents: [{ id: 'document-split', node_type: 'dokument' }],
      },
      {
        id: 'fundstelle-norm-only',
        node_type: 'fundstelle',
        parents: [{ id: 'norm-split', node_type: 'norm' }],
      },
      {
        id: 'topic-norm-for-external-norm',
        node_type: 'topic_norm',
        parents: [{ id: 'topic-external-norm', node_type: 'topic' }],
      },
      {
        id: 'norm-for-external-norm',
        node_type: 'norm',
        parents: [
          { id: 'topic-norm-for-external-norm', node_type: 'topic_norm' },
        ],
      },
      {
        id: 'document-for-external-norm',
        node_type: 'dokument',
        parents: [{ id: 'topic-external-norm', node_type: 'topic' }],
      },
      {
        id: 'fundstelle-with-external-norm',
        node_type: 'fundstelle',
        parents: [
          { id: 'document-for-external-norm', node_type: 'dokument' },
          { id: 'norm-external', node_type: 'norm' },
        ],
      },
      {
        id: 'topic-norm-for-external-document',
        node_type: 'topic_norm',
        parents: [{ id: 'topic-external-document', node_type: 'topic' }],
      },
      {
        id: 'norm-for-external-document',
        node_type: 'norm',
        parents: [
          { id: 'topic-norm-for-external-document', node_type: 'topic_norm' },
        ],
      },
      {
        id: 'document-for-external-document',
        node_type: 'dokument',
        parents: [{ id: 'topic-external-document', node_type: 'topic' }],
      },
      {
        id: 'fundstelle-with-external-document',
        node_type: 'fundstelle',
        parents: [
          { id: 'document-external', node_type: 'dokument' },
          { id: 'norm-for-external-document', node_type: 'norm' },
        ],
      },
    ]);

    const presenceByTopicId = mapInternalFundstellePresenceByTopicId(
      topics,
      index,
    );

    expect(presenceByTopicId).toEqual(
      new Map([
        ['topic-internal', true],
        ['topic-split', false],
        ['topic-external-norm', false],
        ['topic-external-document', false],
      ]),
    );
  });

  it('counts only topics with all norms checked as completed', () => {
    const topics = [
      createTopic({ id: 'topic-1' }),
      createTopic({ id: 'topic-2' }),
      createTopic({ id: 'topic-3' }),
    ];
    const topicNormsByTopicId = new Map<
      string,
      NodePayloadByType<'topic_norm'>[]
    >([
      [
        'topic-1',
        [
          createTopicNorm({ id: 'topic-norm-1', mvp_status: 'checked' }),
          createTopicNorm({ id: 'topic-norm-2', mvp_status: 'checked' }),
        ],
      ],
      [
        'topic-2',
        [
          createTopicNorm({ id: 'topic-norm-3', mvp_status: 'checked' }),
          createTopicNorm({ id: 'topic-norm-4', mvp_status: 'unchecked' }),
        ],
      ],
      [
        'topic-3',
        [createTopicNorm({ id: 'topic-norm-5', mvp_status: 'unchecked' })],
      ],
    ]);

    expect(countCompletedTopics(topics, topicNormsByTopicId)).toBe(1);
  });

  it('filters topics by derived norm review status', () => {
    const topics = [
      createTopic({ id: 'topic-open' }),
      createTopic({ id: 'topic-in-progress' }),
      createTopic({ id: 'topic-complete' }),
    ];
    const topicNormsByTopicId = new Map<
      string,
      NodePayloadByType<'topic_norm'>[]
    >([
      [
        'topic-open',
        [createTopicNorm({ id: 'topic-norm-open', mvp_status: 'unchecked' })],
      ],
      [
        'topic-in-progress',
        [
          createTopicNorm({
            id: 'topic-norm-progress-1',
            mvp_status: 'checked',
          }),
          createTopicNorm({
            id: 'topic-norm-progress-2',
            mvp_status: 'unchecked',
          }),
        ],
      ],
      [
        'topic-complete',
        [createTopicNorm({ id: 'topic-norm-complete', mvp_status: 'checked' })],
      ],
    ]);

    expect(
      filterTopicsByStatus(topics, topicNormsByTopicId, 'inProgress').map(
        (topic) => topic.id,
      ),
    ).toEqual(['topic-in-progress']);
    expect(
      filterTopicsByStatus(topics, topicNormsByTopicId, undefined),
    ).toEqual(topics);
  });

  it('filters topics by selected assignees with OR semantics', () => {
    const topics = [
      createTopic({ id: 'topic-1', mvp_assignees: ['user-1'] }),
      createTopic({ id: 'topic-2', mvp_assignees: ['user-2', 'user-3'] }),
      createTopic({ id: 'topic-3', mvp_assignees: ['user-4'] }),
      createTopic({ id: 'topic-empty', mvp_assignees: [] }),
    ];

    expect(filterTopicsByAssignees(topics, undefined)).toEqual(topics);
    expect(
      filterTopicsByAssignees(topics, []).map((topic) => topic.id),
    ).toEqual(topics.map((topic) => topic.id));
    expect(
      filterTopicsByAssignees(topics, ['user-1', 'user-3']).map(
        (topic) => topic.id,
      ),
    ).toEqual(['topic-1', 'topic-2']);
    expect(
      filterTopicsByAssignees(topics, [TOPIC_UNASSIGNED_FILTER_ID]).map(
        (topic) => topic.id,
      ),
    ).toEqual(['topic-empty']);
    expect(
      filterTopicsByAssignees(topics, [
        TOPIC_UNASSIGNED_FILTER_ID,
        'user-1',
      ]).map((topic) => topic.id),
    ).toEqual(['topic-1', 'topic-empty']);
  });

  it('sorts topics by title ascending', () => {
    const topics = [
      createTopic({ id: 'topic-b', name: 'Bravo' }),
      createTopic({ id: 'topic-a', name: 'Alpha' }),
      createTopic({ id: 'topic-c', name: 'Charlie' }),
    ];

    expect(sortTopics(topics, 'titleAsc').map((topic) => topic.id)).toEqual([
      'topic-a',
      'topic-b',
      'topic-c',
    ]);
  });

  it('sorts topics by title descending', () => {
    const topics = [
      createTopic({ id: 'topic-b', name: 'Bravo' }),
      createTopic({ id: 'topic-a', name: 'Alpha' }),
      createTopic({ id: 'topic-c', name: 'Charlie' }),
    ];

    expect(sortTopics(topics, 'titleDesc').map((topic) => topic.id)).toEqual([
      'topic-c',
      'topic-b',
      'topic-a',
    ]);
  });
});
