import type { BeteiligungTyp } from '@/api-clients/backend';
import type { CompositeKey } from '@/db/nodes/compositeKey';
import { describe, expect, it } from 'vitest';
import type {
  EwmsArgumentNode,
  EwmsBeteiligungsEingang,
} from './data/ewms.nodes';
import {
  getEwmsArgumentsForTopicSelection,
  getEwmsObjectionDisplayName,
  getEwmsPathDisplayName,
  getEwmsTopicIdForArgument,
  groupArgumentsByBeteiligungsEingangId,
  groupArgumentsByTopicId,
  matchesBeteiligungsEingangFilter,
  matchesEwmsObjectionItemFilter,
  resolveEwmsClassificationState,
  resolveEwmsReferenceId,
  sortEwmsArguments,
  sortEwmsObjectionItems,
} from './data/ewms.nodes';
import { EWMS_UNASSIGNED_SUBTOPIC_SELECTION } from './data/ewmsSubtopicSelection';

const makeEntry = (
  beteiligungTyp: BeteiligungTyp,
  classificationStatus: EwmsBeteiligungsEingang['classificationStatus'] = 'loading',
  fileId = 'file-1',
): EwmsBeteiligungsEingang =>
  ({
    compositeKey: `beteiligungs_eingang:${beteiligungTyp}` as CompositeKey,
    id: beteiligungTyp,
    nodeType: 'beteiligungs_eingang',
    beteiligungTyp: beteiligungTyp,
    fileId: fileId,
    filename: `${fileId}.pdf`,
    markdownId: null,
    extractionStatus: 'success',
    classificationStatus: classificationStatus,
    projectId: 'project-1',
    isDeleted: false,
    isOutdated: false,
    frontendParentIds: [],
    projectVersion: 1,
    updateType: null,
    createdAt: '',
    updatedAt: '',
  }) satisfies EwmsBeteiligungsEingang;

const makeNamedEntry = (
  beteiligungTyp: BeteiligungTyp,
  filename: string,
  fileId = 'file-1',
): EwmsBeteiligungsEingang => ({
  ...makeEntry(beteiligungTyp, 'done', fileId),
  filename,
});

const makeArgument = (
  id: string,
  beteiligungsEingangId: string,
  topicId: string | null = null,
  subtopicId: string | null = null,
): EwmsArgumentNode =>
  ({
    compositeKey: `argument:${id}` as CompositeKey,
    id,
    nodeType: 'argument',
    beteiligungsEingangId: beteiligungsEingangId,
    extractionPayload: null,
    subTopicId: subtopicId,
    topicId: topicId,
    text: 'Argument',
    startIdx: null,
    endIdx: null,
    erwiderung: null,
    einordnung: null,
    context: null,
    contextStartIdx: null,
    contextEndIdx: null,
    argumentId: null,
    status: 'open',
    topicConfidence: null,
    subTopicConfidence: null,
    inVae: false,
    isValidArgument: true,
    projectId: 'project-1',
    isDeleted: false,
    frontendParentIds: [],
    updateType: null,
    createdAt: '',
    updatedAt: '',
  }) satisfies EwmsArgumentNode;

describe('matchesBeteiligungsEingangFilter', () => {
  it('always matches when the filter is missing', () => {
    expect(
      matchesBeteiligungsEingangFilter(makeEntry('einwendung'), undefined),
    ).toBe(true);
    expect(
      matchesBeteiligungsEingangFilter(makeEntry('stellungnahme'), undefined),
    ).toBe(true);
  });

  it('matches einwendung directly for the private filter button', () => {
    expect(
      matchesBeteiligungsEingangFilter(makeEntry('einwendung'), ['einwendung']),
    ).toBe(true);
    expect(
      matchesBeteiligungsEingangFilter(makeEntry('stellungnahme'), [
        'einwendung',
      ]),
    ).toBe(false);
  });

  it('matches stellungnahme and naturschutz for the ToB filter button', () => {
    expect(
      matchesBeteiligungsEingangFilter(makeEntry('stellungnahme'), [
        'stellungnahme',
        'naturschutz',
      ]),
    ).toBe(true);
    expect(
      matchesBeteiligungsEingangFilter(makeEntry('naturschutz'), [
        'stellungnahme',
        'naturschutz',
      ]),
    ).toBe(true);
    expect(
      matchesBeteiligungsEingangFilter(makeEntry('einwendung'), [
        'stellungnahme',
        'naturschutz',
      ]),
    ).toBe(false);
  });

  it('can filter only stellungnahme when the array contains one value', () => {
    expect(
      matchesBeteiligungsEingangFilter(makeEntry('stellungnahme'), [
        'stellungnahme',
      ]),
    ).toBe(true);
    expect(
      matchesBeteiligungsEingangFilter(makeEntry('naturschutz'), [
        'stellungnahme',
      ]),
    ).toBe(false);
  });
});

describe('EWMS node grouping helpers', () => {
  it('groups arguments by Beteiligungseingang id', () => {
    const grouped = groupArgumentsByBeteiligungsEingangId([
      makeArgument('a1', 'entry-1'),
      makeArgument('a2', 'entry-1'),
      makeArgument('a3', 'entry-2'),
    ]);

    expect(grouped.get('entry-1')).toHaveLength(2);
    expect(grouped.get('entry-2')).toHaveLength(1);
  });

  it('groups arguments by their OMS topic id', () => {
    const topicArgument = makeArgument('a1', 'entry-1', 'topic-1');
    const unassignedArgument = makeArgument('a2', 'entry-1');

    expect(getEwmsTopicIdForArgument(topicArgument)).toBe('topic-1');
    expect(groupArgumentsByTopicId([topicArgument]).get('topic-1')).toEqual([
      topicArgument,
    ]);
    expect(groupArgumentsByTopicId([unassignedArgument]).size).toBe(0);
  });

  it('filters a selected topic by subtopic selection', () => {
    const unassignedSubtopicArgument = makeArgument('a1', 'entry-1', 'topic-1');
    const selectedSubtopicArgument = makeArgument(
      'a2',
      'entry-1',
      'topic-1',
      'subtopic-1',
    );
    const otherSubtopicArgument = makeArgument(
      'a3',
      'entry-1',
      'topic-1',
      'subtopic-2',
    );
    const grouped = groupArgumentsByTopicId([
      unassignedSubtopicArgument,
      selectedSubtopicArgument,
      otherSubtopicArgument,
    ]);

    expect(
      getEwmsArgumentsForTopicSelection(grouped, 'topic-1', undefined),
    ).toEqual([
      unassignedSubtopicArgument,
      selectedSubtopicArgument,
      otherSubtopicArgument,
    ]);
    expect(
      getEwmsArgumentsForTopicSelection(
        grouped,
        'topic-1',
        EWMS_UNASSIGNED_SUBTOPIC_SELECTION,
      ),
    ).toEqual([unassignedSubtopicArgument]);
    expect(
      getEwmsArgumentsForTopicSelection(grouped, 'topic-1', 'subtopic-1'),
    ).toEqual([selectedSubtopicArgument]);
  });
});

describe('resolveEwmsReferenceId', () => {
  it('uses the backend argument id for display instead of the node id', () => {
    expect(
      resolveEwmsReferenceId({
        ...makeArgument('node-id-1', 'entry-1'),
        argumentId: 'EXAMPLE-ARG-1',
      }),
    ).toBe('EXAMPLE-ARG-1');
  });

  it('falls back to the node id while legacy argument ids are missing', () => {
    expect(resolveEwmsReferenceId(makeArgument('node-id-1', 'entry-1'))).toBe(
      'node-id-1',
    );
  });
});

describe('sortEwmsArguments', () => {
  it('sorts backend reference ids with numeric locale comparison', () => {
    const sorted = sortEwmsArguments([
      { ...makeArgument('node-3', 'entry-1'), argumentId: 'EXAMPLE-ARG-10' },
      { ...makeArgument('node-2', 'entry-1'), argumentId: 'EXAMPLE-ARG-2' },
      { ...makeArgument('node-1', 'entry-1'), argumentId: 'EXAMPLE-ARG-1' },
    ]);

    expect(sorted.map(resolveEwmsReferenceId)).toEqual([
      'EXAMPLE-ARG-1',
      'EXAMPLE-ARG-2',
      'EXAMPLE-ARG-10',
    ]);
  });
});

describe('sortEwmsObjectionItems', () => {
  it('sorts Beteiligungseingänge by display name', () => {
    const items = [
      { entry: makeNamedEntry('stellungnahme', 'Beta 10.pdf', 'file-2') },
      { entry: makeNamedEntry('einwendung', 'Alpha.pdf') },
      { entry: makeNamedEntry('naturschutz', 'Beta 2.pdf', 'file-3') },
    ];

    expect(
      sortEwmsObjectionItems(items, 'nameAsc').map(getEwmsObjectionDisplayName),
    ).toEqual(['Alpha.pdf', 'Beta 2.pdf', 'Beta 10.pdf']);
    expect(
      sortEwmsObjectionItems(items, 'nameDesc').map(
        getEwmsObjectionDisplayName,
      ),
    ).toEqual(['Beta 10.pdf', 'Beta 2.pdf', 'Alpha.pdf']);
  });

  it('sorts Beteiligungseingänge by creation date', () => {
    const items = [
      {
        entry: {
          ...makeNamedEntry('stellungnahme', 'Beta.pdf', 'file-2'),
          createdAt: '2026-02-01T00:00:00.000Z',
        },
      },
      {
        entry: {
          ...makeNamedEntry('einwendung', 'Alpha.pdf'),
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      },
      {
        entry: {
          ...makeNamedEntry('naturschutz', 'Gamma.pdf', 'file-3'),
          createdAt: '2026-03-01T00:00:00.000Z',
        },
      },
    ];

    expect(
      sortEwmsObjectionItems(items, 'createdAtDesc').map(
        getEwmsObjectionDisplayName,
      ),
    ).toEqual(['Gamma.pdf', 'Beta.pdf', 'Alpha.pdf']);
    expect(
      sortEwmsObjectionItems(items, 'createdAtAsc').map(
        getEwmsObjectionDisplayName,
      ),
    ).toEqual(['Alpha.pdf', 'Beta.pdf', 'Gamma.pdf']);
  });
});

describe('EWMS objection list items', () => {
  it('uses the OMS entry filename for display', () => {
    const item = { entry: makeEntry('einwendung') };

    expect(getEwmsObjectionDisplayName(item)).toBe('file-1.pdf');
  });

  it('uses only the final path segment for OMS entry filenames', () => {
    const item = {
      entry: {
        ...makeEntry('einwendung'),
        filename: 'contains-invalid-files/ABC-S8689_8243804475-typed.pdf',
      },
    };

    expect(getEwmsObjectionDisplayName(item)).toBe(
      'ABC-S8689_8243804475-typed.pdf',
    );
  });

  it('falls back to the file id when file names are missing', () => {
    const item = {
      entry: { ...makeEntry('einwendung'), filename: null },
    };

    expect(getEwmsObjectionDisplayName(item)).toBe('file-1');
  });

  it('treats loading and missing classification status as loading', () => {
    const loadingStatusItem = { entry: makeEntry('einwendung') };
    const missingStatusItem = {
      ...loadingStatusItem,
      entry: {
        ...makeEntry('einwendung'),
        classificationStatus: undefined,
      } as unknown as EwmsBeteiligungsEingang,
    };
    const nullStatusItem = {
      ...loadingStatusItem,
      entry: {
        ...makeEntry('einwendung'),
        classificationStatus: null,
      } as unknown as EwmsBeteiligungsEingang,
    };

    expect(resolveEwmsClassificationState(loadingStatusItem)).toBe('loading');
    expect(resolveEwmsClassificationState(missingStatusItem)).toBe('loading');
    expect(resolveEwmsClassificationState(nullStatusItem)).toBe('loading');
  });

  it('resolves classification status for completed and failed entries', () => {
    const doneItem = { entry: makeEntry('einwendung', 'done') };
    const failedItem = {
      entry: makeEntry('stellungnahme', 'failed', 'file-2'),
    };

    expect(resolveEwmsClassificationState(doneItem)).toBe('done');
    expect(resolveEwmsClassificationState(failedItem)).toBe('failed');
  });

  it('applies Beteiligung type filters to OMS entries', () => {
    const privateItem = { entry: makeEntry('einwendung', 'done') };
    const tobItem = { entry: makeEntry('stellungnahme', 'done', 'file-2') };

    expect(matchesEwmsObjectionItemFilter(privateItem, undefined)).toBe(true);
    expect(matchesEwmsObjectionItemFilter(privateItem, ['einwendung'])).toBe(
      true,
    );
    expect(matchesEwmsObjectionItemFilter(privateItem, ['stellungnahme'])).toBe(
      false,
    );
    expect(matchesEwmsObjectionItemFilter(tobItem, ['stellungnahme'])).toBe(
      true,
    );
  });

  it('uses only the final path segment for raw EWMS workflow filenames', () => {
    expect(
      getEwmsPathDisplayName(
        'contains-invalid-files/ABC-S8689_8243804475-typed.pdf',
      ),
    ).toBe('ABC-S8689_8243804475-typed.pdf');
  });
});
