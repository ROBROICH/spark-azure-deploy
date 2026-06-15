import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import type {
  AvailableNormEntry,
  TopicNormEntry,
} from './useRechtsgrundlageData.helpers';
import {
  sortAvailableNormEntriesByParagraphNumber,
  sortTopicNormsByParagraphNumber,
} from './useRechtsgrundlageData.helpers';

const createTopicNormEntry = (id: string, paragraphNr: string) => {
  return {
    topicNorm: {
      absatz: null,
      compositeKey: toCompositeKey({ id, node_type: 'topic_norm' }),
      created_at: '2026-05-14T10:00:00.000Z',
      frontend_parent_ids: ['topic:topic-1'],
      id,
      is_deleted: false,
      is_outdated: false,
      jurabk: 'BNatSchG',
      mvp_status: 'unchecked',
      node_type: 'topic_norm',
      nummer: null,
      paragraph_nr: paragraphNr,
      project_id: 'project-1',
      project_version: 1,
      satz: null,
      satz_statuses: {},
      sys_period: null,
      topic_id: 'topic-1',
      type: 'pruefung',
      update_type: null,
      updated_at: '2026-05-14T10:00:00.000Z',
    } satisfies NodePayloadByType<'topic_norm'>,
    gesetz: null,
    norm: null,
  } satisfies TopicNormEntry;
};

const createAvailableNormEntry = (id: string, paragraphNr: string) => {
  return {
    norm: {
      compositeKey: toCompositeKey({ id, node_type: 'norm' }),
      created_at: '2026-05-14T10:00:00.000Z',
      frontend_parent_ids: [],
      gesetz_id: 'gesetz-1',
      id,
      is_deleted: false,
      is_outdated: false,
      node_type: 'norm',
      paragraph_nr: paragraphNr,
      paragraph_titel: null,
      project_id: 'project-1',
      project_version: 1,
      regelungsgegenstand: null,
      sys_period: null,
      text: '',
      update_type: null,
      updated_at: '2026-05-14T10:00:00.000Z',
    } satisfies NodePayloadByType<'norm'>,
    gesetz: null,
    topicNorms: [],
    topicNorm: null,
  } satisfies AvailableNormEntry;
};

describe('sortTopicNormsByParagraphNumber', () => {
  it('sorts topic norms by paragraph number ascending within a law group', () => {
    const topicNorms = [
      createTopicNormEntry('topic-norm-45', '45').topicNorm,
      createTopicNormEntry('topic-norm-12a', '12a').topicNorm,
      createTopicNormEntry('topic-norm-3', '§ 3').topicNorm,
      createTopicNormEntry('topic-norm-12', '12').topicNorm,
    ];

    expect(
      sortTopicNormsByParagraphNumber(topicNorms).map(
        (topicNorm) => topicNorm.id,
      ),
    ).toEqual([
      'topic-norm-3',
      'topic-norm-12',
      'topic-norm-12a',
      'topic-norm-45',
    ]);
  });
});

describe('sortAvailableNormEntriesByParagraphNumber', () => {
  it('sorts available norms by paragraph number ascending within a law group', () => {
    const normEntries = [
      createAvailableNormEntry('norm-45', '45'),
      createAvailableNormEntry('norm-12a', '12a'),
      createAvailableNormEntry('norm-3', '§ 3'),
      createAvailableNormEntry('norm-12', '12'),
    ];

    expect(
      sortAvailableNormEntriesByParagraphNumber(normEntries).map(
        (normEntry) => normEntry.norm.id,
      ),
    ).toEqual(['norm-3', 'norm-12', 'norm-12a', 'norm-45']);
  });
});
