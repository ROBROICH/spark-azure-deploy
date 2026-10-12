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
    createdAt: timestamp,
    description: null,
    frontendParentIds: [],
    id,
    isDeleted: false,
    isOutdated: false,
    mvpAssignee: null,
    mvpAssignees: [],
    name: id,
    nodeType: 'topic',
    parentTopicId: null,
    projectId: 'project-1',
    projectVersion: 1,
    rpbAssignee: null,
    rpbAssignees: [],
    showInBeschluss: true,
    showInEwm: true,
    showInMvp: true,
    updateType: null,
    updatedAt: timestamp,
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
    createdAt: timestamp,
    frontendParentIds: [],
    id,
    isDeleted: false,
    isOutdated: false,
    jurabk: 'BNatSchG',
    mvpStatus: 'unchecked',
    nodeType: 'topic_norm',
    nummer: null,
    paragraphNr: null,
    projectId: 'project-1',
    projectVersion: 1,
    satz: null,
    satzStatuses: {},
    topicId: 'topic-1',
    type: 'pruefung',
    updateType: null,
    updatedAt: timestamp,
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
        createTopicNorm({ id: 'topic-norm-1', mvpStatus: 'unchecked' }),
        createTopicNorm({ id: 'topic-norm-2', mvpStatus: 'unchecked' }),
      ]),
    ).toEqual({
      checkedNormCount: 0,
      totalNormCount: 2,
      status: 'open',
    });

    expect(
      deriveTopicProgress([
        createTopicNorm({ id: 'topic-norm-1', mvpStatus: 'checked' }),
        createTopicNorm({ id: 'topic-norm-2', mvpStatus: 'unchecked' }),
      ]),
    ).toEqual({
      checkedNormCount: 1,
      totalNormCount: 2,
      status: 'inProgress',
    });

    expect(
      deriveTopicProgress([
        createTopicNorm({ id: 'topic-norm-1', mvpStatus: 'checked' }),
        createTopicNorm({ id: 'topic-norm-2', mvpStatus: 'checked' }),
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
      { id: 'topic-1', nodeType: 'topic', parents: [] },
      { id: 'topic-2', nodeType: 'topic', parents: [] },
      {
        id: 'topic-norm-1',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      },
      {
        id: 'topic-norm-2',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      },
      {
        id: 'topic-norm-3',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-2', nodeType: 'topic' }],
      },
    ]);
    const topicNorms = [
      createTopicNorm({
        id: 'topic-norm-1',
        frontendParentIds: ['subtopic:subtopic-1'],
        mvpStatus: 'checked',
        topicId: 'topic-1',
      }),
      createTopicNorm({
        id: 'topic-norm-2',
        frontendParentIds: [],
        mvpStatus: 'unchecked',
        topicId: 'topic-1',
      }),
      createTopicNorm({
        id: 'topic-norm-3',
        mvpStatus: 'checked',
        topicId: 'topic-2',
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
      { id: 'topic-1', nodeType: 'topic', parents: [] },
      { id: 'topic-2', nodeType: 'topic', parents: [] },
      {
        id: 'topic-norm-valid',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      },
      {
        id: 'topic-norm-stale-summary',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      },
    ]);
    const topicNorms = [
      createTopicNorm({
        id: 'topic-norm-valid',
        frontendParentIds: [],
        topicId: 'topic-2',
        mvpStatus: 'unchecked',
      }),
      createTopicNorm({
        id: 'topic-norm-stale-summary',
        frontendParentIds: [],
        topicId: 'topic-2',
        mvpStatus: 'checked',
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
      { id: 'topic-1', nodeType: 'topic', parents: [] },
      { id: 'topic-2', nodeType: 'topic', parents: [] },
      {
        id: 'document-1',
        nodeType: 'dokument',
        parents: [],
        frontendParentIds: ['topic:topic-1'],
      },
      {
        id: 'document-2',
        nodeType: 'dokument',
        parents: [],
        frontendParentIds: ['topic:topic-1'],
      },
      {
        id: 'document-3',
        nodeType: 'dokument',
        parents: [],
        frontendParentIds: ['topic:topic-2'],
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
      { id: 'topic-internal', nodeType: 'topic', parents: [] },
      { id: 'topic-split', nodeType: 'topic', parents: [] },
      { id: 'topic-external-norm', nodeType: 'topic', parents: [] },
      { id: 'topic-external-document', nodeType: 'topic', parents: [] },
      { id: 'document-external', nodeType: 'dokument', parents: [] },
      { id: 'norm-external', nodeType: 'norm', parents: [] },
      {
        id: 'topic-norm-internal',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-internal', nodeType: 'topic' }],
      },
      {
        id: 'norm-internal',
        nodeType: 'norm',
        parents: [{ id: 'topic-norm-internal', nodeType: 'topic_norm' }],
      },
      {
        id: 'document-internal',
        nodeType: 'dokument',
        parents: [{ id: 'topic-internal', nodeType: 'topic' }],
      },
      {
        id: 'fundstelle-internal',
        nodeType: 'fundstelle',
        parents: [
          { id: 'document-internal', nodeType: 'dokument' },
          { id: 'norm-internal', nodeType: 'norm' },
        ],
      },
      {
        id: 'topic-norm-split',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-split', nodeType: 'topic' }],
      },
      {
        id: 'norm-split',
        nodeType: 'norm',
        parents: [{ id: 'topic-norm-split', nodeType: 'topic_norm' }],
      },
      {
        id: 'document-split',
        nodeType: 'dokument',
        parents: [{ id: 'topic-split', nodeType: 'topic' }],
      },
      {
        id: 'fundstelle-document-only',
        nodeType: 'fundstelle',
        parents: [{ id: 'document-split', nodeType: 'dokument' }],
      },
      {
        id: 'fundstelle-norm-only',
        nodeType: 'fundstelle',
        parents: [{ id: 'norm-split', nodeType: 'norm' }],
      },
      {
        id: 'topic-norm-for-external-norm',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-external-norm', nodeType: 'topic' }],
      },
      {
        id: 'norm-for-external-norm',
        nodeType: 'norm',
        parents: [
          { id: 'topic-norm-for-external-norm', nodeType: 'topic_norm' },
        ],
      },
      {
        id: 'document-for-external-norm',
        nodeType: 'dokument',
        parents: [{ id: 'topic-external-norm', nodeType: 'topic' }],
      },
      {
        id: 'fundstelle-with-external-norm',
        nodeType: 'fundstelle',
        parents: [
          { id: 'document-for-external-norm', nodeType: 'dokument' },
          { id: 'norm-external', nodeType: 'norm' },
        ],
      },
      {
        id: 'topic-norm-for-external-document',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-external-document', nodeType: 'topic' }],
      },
      {
        id: 'norm-for-external-document',
        nodeType: 'norm',
        parents: [
          { id: 'topic-norm-for-external-document', nodeType: 'topic_norm' },
        ],
      },
      {
        id: 'document-for-external-document',
        nodeType: 'dokument',
        parents: [{ id: 'topic-external-document', nodeType: 'topic' }],
      },
      {
        id: 'fundstelle-with-external-document',
        nodeType: 'fundstelle',
        parents: [
          { id: 'document-external', nodeType: 'dokument' },
          { id: 'norm-for-external-document', nodeType: 'norm' },
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
          createTopicNorm({ id: 'topic-norm-1', mvpStatus: 'checked' }),
          createTopicNorm({ id: 'topic-norm-2', mvpStatus: 'checked' }),
        ],
      ],
      [
        'topic-2',
        [
          createTopicNorm({ id: 'topic-norm-3', mvpStatus: 'checked' }),
          createTopicNorm({ id: 'topic-norm-4', mvpStatus: 'unchecked' }),
        ],
      ],
      [
        'topic-3',
        [createTopicNorm({ id: 'topic-norm-5', mvpStatus: 'unchecked' })],
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
        [createTopicNorm({ id: 'topic-norm-open', mvpStatus: 'unchecked' })],
      ],
      [
        'topic-in-progress',
        [
          createTopicNorm({
            id: 'topic-norm-progress-1',
            mvpStatus: 'checked',
          }),
          createTopicNorm({
            id: 'topic-norm-progress-2',
            mvpStatus: 'unchecked',
          }),
        ],
      ],
      [
        'topic-complete',
        [createTopicNorm({ id: 'topic-norm-complete', mvpStatus: 'checked' })],
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
      createTopic({ id: 'topic-1', mvpAssignees: ['user-1'] }),
      createTopic({ id: 'topic-2', mvpAssignees: ['user-2', 'user-3'] }),
      createTopic({ id: 'topic-3', mvpAssignees: ['user-4'] }),
      createTopic({ id: 'topic-empty', mvpAssignees: [] }),
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
