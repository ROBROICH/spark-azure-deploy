import { describe, expect, it } from 'vitest';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { RpbArgumentNode } from './rpbParticipationArguments';
import {
  buildRpbParticipationSubtopicItemFromArguments,
  sortRpbArguments,
} from './rpbParticipationArguments';

const argument = (
  overrides: Partial<RpbArgumentNode> & Pick<RpbArgumentNode, 'id'>,
): RpbArgumentNode =>
  ({
    argumentId: null,
    beteiligungsEingangId: 'entry-1',
    extractionPayload: null,
    compositeKey: toCompositeKey({
      id: overrides.id,
      nodeType: 'argument',
    }),
    context: null,
    contextEndIdx: null,
    contextStartIdx: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    einordnung: null,
    endIdx: null,
    erwiderung: null,
    frontendParentIds: [],
    inVae: false,
    isValidArgument: true,
    isDeleted: false,
    nodeType: 'argument',
    projectId: 'project-1',
    startIdx: null,
    status: 'open',
    topicConfidence: null,
    subTopicConfidence: null,
    subTopicId: null,
    text: null,
    topicId: 'topic-1',
    updateType: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) satisfies RpbArgumentNode;

describe('rpbParticipationArguments', () => {
  it('counts invalid arguments in totals but not in valid progress', () => {
    const item = buildRpbParticipationSubtopicItemFromArguments(
      'subtopic-1',
      'Artenschutz',
      [
        argument({
          id: 'argument-1',
          inVae: true,
          isValidArgument: true,
          subTopicId: 'subtopic-1',
        }),
        argument({
          id: 'argument-2',
          inVae: true,
          isValidArgument: false,
          subTopicId: 'subtopic-1',
        }),
      ],
    );

    expect(item).toMatchObject({
      totalCount: 2,
      validCount: 1,
      inBeschlussCount: 1,
    });
  });

  it('sorts valid arguments before invalid arguments by reference', () => {
    const sorted = sortRpbArguments([
      argument({
        id: 'argument-3',
        argumentId: 'A1',
        isValidArgument: false,
      }),
      argument({
        id: 'argument-2',
        argumentId: 'A10',
        isValidArgument: true,
      }),
      argument({
        id: 'argument-1',
        argumentId: 'A2',
        isValidArgument: true,
      }),
    ]);

    expect(sorted.map((item) => item.id)).toEqual([
      'argument-1',
      'argument-2',
      'argument-3',
    ]);
  });
});
