import { describe, expect, it } from 'vitest';

import beschlussFixture from '../data/catalog-mock/fixtures/beschluss.json';
import gesetzesgrundlageFixture from '../data/catalog-mock/fixtures/gesetzesgrundlage.json';
import type {
  BeschlussDocument,
  CatalogTopic,
  GesetzesgrundlageDocument,
} from '../data/usecaseApi';
import { collectCatalogIssues } from './catalogDraftValidation';
import {
  catalogDraftReducer,
  createCatalogDraftState,
  createEmptyNorm,
} from './gesetzesgrundlageDraft';
import { encodePrivateTopicGroupName } from './topicStateNormAdapter';

const fixtureDocument = gesetzesgrundlageFixture as GesetzesgrundlageDocument;
const fixtureBeschluss = beschlussFixture as BeschlussDocument;

const topicByName = (
  document: GesetzesgrundlageDocument,
  name: string,
): CatalogTopic => {
  const topic = document.topics.find((candidate) => candidate.name === name);
  if (!topic) {
    throw new Error(`Missing fixture topic ${name}`);
  }
  return topic;
};

const draftFromFixture = () =>
  createCatalogDraftState(fixtureDocument, fixtureBeschluss.nodes);

describe('catalogDraftReducer', () => {
  it('refreshes referenced topics without replacing a dirty document', () => {
    const state = draftFromFixture();
    const refreshedNodes = fixtureBeschluss.nodes.map((node, index) => ({
      ...node,
      topic: index === 0 ? 'Externes Thema' : null,
    }));

    const refreshed = catalogDraftReducer(state, {
      type: 'refreshReferencedTopics',
      beschlussNodes: refreshedNodes,
    });

    expect(refreshed.document).toBe(state.document);
    expect(refreshed.referencedTopics.get('Externes Thema')).toEqual([
      refreshedNodes[0]?.title,
    ]);
  });

  it('adds, edits, and removes a topic', () => {
    let state = draftFromFixture();
    const initialCount = state.document.topics.length;

    state = catalogDraftReducer(state, {
      type: 'addTopic',
      name: 'Neues Thema',
    });
    expect(state.document.topics).toHaveLength(initialCount + 1);
    expect(state.document.topics.at(-1)?.name).toBe('Neues Thema');

    const newIndex = state.document.topics.length - 1;
    state = catalogDraftReducer(state, {
      type: 'updateTopic',
      topicIndex: newIndex,
      patch: {
        description: 'Beschreibung',
        showInMvp: true,
      },
    });
    expect(state.document.topics[newIndex]?.description).toBe('Beschreibung');
    expect(state.document.topics[newIndex]?.showInMvp).toBe(true);

    state = catalogDraftReducer(state, {
      type: 'removeTopic',
      topicIndex: newIndex,
    });
    expect(state.document.topics).toHaveLength(initialCount);
    expect(state.lastRefusal).toBeNull();
  });

  it('adds, edits, and removes a subtopic within its topic', () => {
    let state = draftFromFixture();
    const umweltIndex = state.document.topics.findIndex(
      (topic) => topic.name === 'Umweltverträglichkeitsprüfung',
    );
    expect(umweltIndex).toBeGreaterThanOrEqual(0);
    const before = topicByName(state.document, 'Umweltverträglichkeitsprüfung')
      .subtopics.length;

    state = catalogDraftReducer(state, {
      type: 'addSubtopic',
      topicIndex: umweltIndex,
      name: 'Neues Unterthema',
    });
    expect(
      topicByName(state.document, 'Umweltverträglichkeitsprüfung').subtopics,
    ).toHaveLength(before + 1);

    state = catalogDraftReducer(state, {
      type: 'updateSubtopic',
      topicIndex: umweltIndex,
      subtopicIndex: before,
      patch: { description: 'Unterthema-Text', showInEwm: true },
    });
    expect(
      topicByName(state.document, 'Umweltverträglichkeitsprüfung').subtopics[
        before
      ]?.description,
    ).toBe('Unterthema-Text');

    state = catalogDraftReducer(state, {
      type: 'removeSubtopic',
      topicIndex: umweltIndex,
      subtopicIndex: before,
    });
    expect(
      topicByName(state.document, 'Umweltverträglichkeitsprüfung').subtopics,
    ).toHaveLength(before);
  });

  it('applies federal selections without rewriting state-norm groups', () => {
    let state = draftFromFixture();
    const topicIndex = state.document.topics.findIndex(
      (topic) => topic.name === 'Nebenbestimmungen',
    );
    const legacyGroups = state.document.stateNormGroups;

    state = catalogDraftReducer(state, {
      type: 'setFederalNorms',
      path: { topicIndex },
      selected: [
        {
          jurabk: 'BImSchG',
          paragraphNr: '6',
          absatz: null,
          satz: null,
          nummer: null,
        },
      ],
    });
    expect(
      state.document.topics[topicIndex]?.pruefungsNorms.some(
        (candidate) =>
          candidate.jurabk === 'BImSchG' && candidate.paragraphNr === '6',
      ),
    ).toBe(true);
    expect(state.document.stateNormGroups).toBe(legacyGroups);
  });

  it('refuses a duplicate topic name', () => {
    const state = catalogDraftReducer(draftFromFixture(), {
      type: 'addTopic',
      name: 'Nebenbestimmungen',
    });

    expect(state.lastRefusal).toEqual({
      code: 'duplicateTopicName',
      name: 'Nebenbestimmungen',
      topicIndex: -1,
    });
    expect(
      state.document.topics.filter(
        (topic) => topic.name === 'Nebenbestimmungen',
      ),
    ).toHaveLength(1);
  });

  it('refuses a duplicate subtopic name within the same topic', () => {
    let state = draftFromFixture();
    const umweltIndex = state.document.topics.findIndex(
      (topic) => topic.name === 'Umweltverträglichkeitsprüfung',
    );
    const existingName = state.document.topics[umweltIndex]?.subtopics[0]?.name;
    expect(existingName).toBeDefined();

    state = catalogDraftReducer(state, {
      type: 'addSubtopic',
      topicIndex: umweltIndex,
      name: existingName ?? '',
    });

    expect(state.lastRefusal?.code).toBe('duplicateSubtopicName');
  });

  it('refuses removing a topic referenced by a Beschluss node', () => {
    const state = draftFromFixture();
    const topicIndex = state.document.topics.findIndex(
      (topic) => topic.name === 'Nebenbestimmungen',
    );

    const next = catalogDraftReducer(state, {
      type: 'removeTopic',
      topicIndex,
    });

    expect(next.lastRefusal).toMatchObject({
      code: 'topicReferenced',
      topicName: 'Nebenbestimmungen',
    });
    expect(next.lastRefusal && 'nodeTitles' in next.lastRefusal).toBe(true);
    if (next.lastRefusal && next.lastRefusal.code === 'topicReferenced') {
      expect(next.lastRefusal.nodeTitles).toContain('Nebenbestimmungen');
    }
    expect(next.document.topics[topicIndex]?.name).toBe('Nebenbestimmungen');
  });
});

describe('collectCatalogIssues', () => {
  it('reports a missing jurabk on a drafted norm', () => {
    const document: GesetzesgrundlageDocument = {
      topics: [
        {
          ...createEmptyTopicForTest('Thema'),
          pruefungsNorms: [createEmptyNorm()],
        },
      ],
      stateNormGroups: {},
      topicStateGroups: {},
    };

    expect(collectCatalogIssues(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'missingJurabk',
          list: 'pruefungsNorms',
          normIndex: 0,
        }),
      ]),
    );
  });

  it('reports a duplicate five-field norm identity in the same list', () => {
    const document: GesetzesgrundlageDocument = {
      topics: [
        {
          ...createEmptyTopicForTest('Thema'),
          pruefungsNorms: [
            {
              jurabk: 'VwVfG',
              paragraphNr: '36',
              absatz: '1',
              satz: null,
              nummer: null,
            },
            {
              jurabk: 'VwVfG',
              paragraphNr: '36',
              absatz: '1',
              satz: null,
              nummer: null,
            },
          ],
        },
      ],
      stateNormGroups: {},
      topicStateGroups: {},
    };

    expect(collectCatalogIssues(document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicateNorm',
          jurabk: 'VwVfG',
          paragraphNr: '36',
        }),
      ]),
    );
  });

  it('does not treat the same paragraph with a different absatz as a duplicate', () => {
    const document: GesetzesgrundlageDocument = {
      topics: [
        {
          ...createEmptyTopicForTest('Thema'),
          pruefungsNorms: [
            {
              jurabk: 'VwVfG',
              paragraphNr: '36',
              absatz: null,
              satz: null,
              nummer: null,
            },
            {
              jurabk: 'VwVfG',
              paragraphNr: '36',
              absatz: '1',
              satz: null,
              nummer: null,
            },
          ],
        },
      ],
      stateNormGroups: {},
      topicStateGroups: {},
    };

    expect(collectCatalogIssues(document)).toEqual([]);
  });
});

describe('state norm groups in the shared gesetzesgrundlage draft', () => {
  it('keeps the exact legacy document when Apply does not change the selection', () => {
    const original = createCatalogDraftState(
      {
        topics: [createEmptyTopicForTest('Waldschutz')],
        stateNormGroups: {
          'LwaldG|Bayern': [
            {
              jurabk: 'BayWaldG',
              paragraphNr: '1',
              absatz: null,
              satz: null,
              nummer: null,
            },
          ],
          'LwaldG|BY': [
            {
              jurabk: 'BayWaldG',
              paragraphNr: '2',
              absatz: null,
              satz: null,
              nummer: null,
            },
          ],
        },
        topicStateGroups: { Waldschutz: ['LwaldG'] },
      },
      [],
    );

    const next = catalogDraftReducer(original, {
      type: 'setTopicStateNorms',
      topicIndex: 0,
      selectedByState: {
        BY: [
          {
            jurabk: 'BayWaldG',
            paragraphNr: '2',
            absatz: null,
            satz: null,
            nummer: null,
          },
          {
            jurabk: 'BayWaldG',
            paragraphNr: '1',
            absatz: null,
            satz: null,
            nummer: null,
          },
        ],
      },
    });

    expect(next).toBe(original);
    expect(next.document.stateNormGroups).toEqual({
      'LwaldG|Bayern': [expect.objectContaining({ paragraphNr: '1' })],
      'LwaldG|BY': [expect.objectContaining({ paragraphNr: '2' })],
    });
  });

  it('materializes a topic state selection onto canonical private BY/BW keys', () => {
    const sharedKey = 'LwaldG|BY';
    let state = createCatalogDraftState(
      {
        topics: [
          createEmptyTopicForTest('Waldschutz'),
          createEmptyTopicForTest('Forstwirtschaft'),
        ],
        stateNormGroups: {
          [sharedKey]: [
            {
              jurabk: 'BayWaldG',
              paragraphNr: '1',
              absatz: null,
              satz: null,
              nummer: null,
            },
          ],
          'LwaldG|BW': [
            {
              jurabk: 'LWaldG BW',
              paragraphNr: '1',
              absatz: null,
              satz: null,
              nummer: null,
            },
          ],
        },
        topicStateGroups: {
          Waldschutz: ['LwaldG'],
          Forstwirtschaft: ['LwaldG'],
        },
      },
      [],
    );

    state = catalogDraftReducer(state, {
      type: 'setTopicStateNorms',
      topicIndex: 0,
      selectedByState: {
        BY: [
          {
            jurabk: 'BayWaldG',
            paragraphNr: '9',
            absatz: null,
            satz: null,
            nummer: null,
          },
        ],
      },
    });

    const privateName = encodePrivateTopicGroupName('Waldschutz');
    expect(state.document.topicStateGroups.Waldschutz).toEqual([privateName]);
    expect(state.document.topicStateGroups.Forstwirtschaft).toEqual(['LwaldG']);
    expect(state.document.stateNormGroups[`${privateName}|BY`]).toEqual([
      {
        jurabk: 'BayWaldG',
        paragraphNr: '9',
        absatz: null,
        satz: null,
        nummer: null,
      },
    ]);
    expect(state.document.stateNormGroups[sharedKey]).toEqual([
      {
        jurabk: 'BayWaldG',
        paragraphNr: '1',
        absatz: null,
        satz: null,
        nummer: null,
      },
    ]);
  });
});

function createEmptyTopicForTest(name: string): CatalogTopic {
  return {
    name,
    description: '',
    showInMvp: false,
    showInEwm: false,
    showInBeschluss: false,
    pruefungsNorms: [],
    verfahrensNorms: [],
    subtopics: [],
  };
}
