import type { LegalBasisNormResponse } from './availableRechtsgrundlageData';
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
      compositeKey: toCompositeKey({ id, nodeType: 'topic_norm' }),
      createdAt: '2026-05-14T10:00:00.000Z',
      frontendParentIds: ['topic:topic-1'],
      id,
      isDeleted: false,
      isOutdated: false,
      jurabk: 'BNatSchG',
      mvpStatus: 'unchecked',
      nodeType: 'topic_norm',
      nummer: null,
      paragraphNr: paragraphNr,
      projectId: 'project-1',
      projectVersion: 1,
      satz: null,
      satzStatuses: {},
      topicId: 'topic-1',
      type: 'pruefung',
      updateType: null,
      updatedAt: '2026-05-14T10:00:00.000Z',
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
      paragraphNr: paragraphNr,
    },
    norm: {
      gesetzId: 'gesetz-1',
      id: selectionKey,
      paragraphNr: paragraphNr,
      paragraphTitel: null,
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
    compositeKey: toCompositeKey({ id, nodeType: 'norm' }),
    createdAt: '2026-05-14T10:00:00.000Z',
    frontendParentIds: [`topic_norm:${topicNormId}`],
    gesetzId: 'project-law-bnatschg',
    id,
    isDeleted: false,
    isOutdated: false,
    nodeType: 'norm',
    paragraphNr: paragraphNr,
    paragraphTitel: null,
    projectId: 'project-1',
    projectVersion: 1,
    regelungsgegenstand: null,
    text: '',
    updateType: null,
    updatedAt: '2026-05-14T10:00:00.000Z',
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
    paragraphNr: params.paragraphNr,
    paragraphTitel: paragraphTitle,
    gesetz: {
      id: params.lawId,
      jurabk: params.jurabk,
      name: params.jurabk,
    },
    norm: {
      text: `Normtext ${params.paragraphNr}`,
    },
    isDeconstructed: params.isDeconstructed ?? true,
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
        (normEntry) => normEntry.norm.paragraphNr,
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
          paragraphNr: '44',
          paragraphTitel: 'Artenschutz',
          gesetz: {
            id: 'law-bnatschg',
            jurabk: 'BNatSchG',
            name: 'BNatSchG',
          },
          norm: {
            text: 'Normtext 44',
          },
          isDeconstructed: true,
        },
        {
          jurabk: 'EnWG',
          paragraphNr: '17',
          paragraphTitel: 'Netzanschluss',
          gesetz: {
            id: 'law-enwg',
            jurabk: 'EnWG',
            name: 'EnWG',
          },
          norm: {
            text: 'Normtext 17',
          },
          isDeconstructed: true,
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
        paragraphNr: '44',
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
