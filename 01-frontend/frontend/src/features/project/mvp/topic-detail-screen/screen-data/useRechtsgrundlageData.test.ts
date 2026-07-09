import type { LegalBasisNormResponse } from '@/api-clients/examination-module';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import type {
  AvailableNormEntry,
  TopicNormEntry,
} from './useRechtsgrundlageData.helpers';
import {
  createAvailableRechtsgrundlageData,
  createLegalBasisSelectionKey,
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
  const selectionKey = createLegalBasisSelectionKey('BNatSchG', paragraphNr);

  return {
    selectionKey,
    legalBasis: {
      jurabk: 'BNatSchG',
      paragraph_nr: paragraphNr,
    },
    norm: {
      gesetz_id: 'gesetz-1',
      id: selectionKey,
      paragraph_nr: paragraphNr,
      paragraph_titel: null,
      text: '',
    },
    gesetz: null,
    projectNorm: null,
    topicNorms: [],
    topicNorm: null,
    topicNormLinks: [],
  } satisfies AvailableNormEntry;
};

const createProjectNorm = (
  id: string,
  paragraphNr: string,
  topicNormId: string,
) => {
  return {
    compositeKey: toCompositeKey({ id, node_type: 'norm' }),
    created_at: '2026-05-14T10:00:00.000Z',
    frontend_parent_ids: [`topic_norm:${topicNormId}`],
    gesetz_id: 'project-law-bnatschg',
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
  } satisfies NodePayloadByType<'norm'>;
};

const createLegalBasisNorm = (params: {
  bundesland?: string | null;
  isDeconstructed?: boolean;
  jurabk: string;
  lawId: string;
  paragraphNr: string;
}) => {
  const paragraphTitle = `Titel ${params.paragraphNr}`;

  return {
    bundesland: params.bundesland,
    jurabk: params.jurabk,
    paragraph_nr: params.paragraphNr,
    paragraph_titel: paragraphTitle,
    gesetz: {
      id: params.lawId,
      jurabk: params.jurabk,
      name: params.jurabk,
    },
    norm: {
      id: `law-db-norm-${params.paragraphNr}`,
      gesetz_id: params.lawId,
      paragraph_nr: params.paragraphNr,
      paragraph_titel: paragraphTitle,
      text: `Normtext ${params.paragraphNr}`,
    },
    is_deconstructed: params.isDeconstructed ?? true,
  } satisfies LegalBasisNormResponse;
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
        (normEntry) => normEntry.norm.paragraph_nr,
      ),
    ).toEqual(['§ 3', '12', '12a', '45']);
  });
});

describe('createAvailableRechtsgrundlageData', () => {
  it('groups LawDB norms by law and derives selected state from project graph topic_norms', () => {
    const topicNorm = createTopicNormEntry('topic-norm-44', '44').topicNorm;
    const projectNorm = createProjectNorm(
      'project-norm-44',
      '44',
      topicNorm.id,
    );

    const result = createAvailableRechtsgrundlageData(
      [
        {
          jurabk: 'BNatSchG',
          paragraph_nr: '44',
          paragraph_titel: 'Artenschutz',
          gesetz: {
            id: 'law-bnatschg',
            jurabk: 'BNatSchG',
            name: 'BNatSchG',
          },
          norm: {
            id: 'law-db-norm-44',
            gesetz_id: 'law-bnatschg',
            paragraph_nr: '44',
            paragraph_titel: 'Artenschutz',
            text: 'Normtext 44',
          },
          is_deconstructed: true,
        },
        {
          jurabk: 'EnWG',
          paragraph_nr: '17',
          paragraph_titel: 'Netzanschluss',
          gesetz: {
            id: 'law-enwg',
            jurabk: 'EnWG',
            name: 'EnWG',
          },
          norm: {
            id: 'law-db-norm-17',
            gesetz_id: 'law-enwg',
            paragraph_nr: '17',
            paragraph_titel: 'Netzanschluss',
            text: 'Normtext 17',
          },
          is_deconstructed: true,
        },
      ],
      [projectNorm],
      new Map([[topicNorm.id, topicNorm]]),
      null,
    );

    expect(result.availableLawGroups.map((lawGroup) => lawGroup.id)).toEqual([
      'law-bnatschg',
      'law-enwg',
    ]);
    expect(result.selectedNormIds).toEqual(new Set(['bnatschg::44']));
    expect(result.availableNormEntries[0]).toMatchObject({
      selectionKey: 'bnatschg::44',
      legalBasis: {
        jurabk: 'BNatSchG',
        paragraph_nr: '44',
      },
      projectNorm,
      topicNorms: [topicNorm],
    });
  });

  it('filters norms by project Bundesland and deconstruction state before grouping laws', () => {
    const result = createAvailableRechtsgrundlageData(
      [
        createLegalBasisNorm({
          bundesland: null,
          jurabk: 'BNatSchG',
          lawId: 'law-bnatschg',
          paragraphNr: '44',
        }),
        createLegalBasisNorm({
          bundesland: 'NW',
          jurabk: 'BNatSchG',
          lawId: 'law-bnatschg',
          paragraphNr: '45',
        }),
        createLegalBasisNorm({
          bundesland: 'BY',
          jurabk: 'BNatSchG',
          lawId: 'law-bnatschg',
          paragraphNr: '46',
        }),
        createLegalBasisNorm({
          bundesland: null,
          isDeconstructed: false,
          jurabk: 'BNatSchG',
          lawId: 'law-bnatschg',
          paragraphNr: '47',
        }),
        createLegalBasisNorm({
          bundesland: 'NW',
          isDeconstructed: false,
          jurabk: 'EnWG',
          lawId: 'law-enwg',
          paragraphNr: '17',
        }),
      ],
      [],
      new Map(),
      'NW',
    );

    expect(
      result.availableNormEntries.map((normEntry) => normEntry.selectionKey),
    ).toEqual(['bnatschg::44', 'bnatschg::45']);
    expect(result.availableLawGroups.map((lawGroup) => lawGroup.id)).toEqual([
      'law-bnatschg',
    ]);
    expect(
      result.availableLawGroups[0]?.norms.map((norm) => norm.norm.id),
    ).toEqual(['bnatschg::44', 'bnatschg::45']);
  });
});
