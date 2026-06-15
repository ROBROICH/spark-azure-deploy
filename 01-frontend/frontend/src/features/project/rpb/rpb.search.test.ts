import { describe, expect, it } from 'vitest';
import {
  clearRpbTopicScopedSearch,
  rpbSearchSchema,
  setRpbOutlineSelectionSearch,
  setRpbTopicSearch,
} from './rpb.search';

describe('rpb.search', () => {
  it('parses KI overview and participation subtopic search params', () => {
    expect(
      rpbSearchSchema.parse({
        aiOverviewSection: 'beteiligungseingaenge',
        participationSubtopicId: '__sonstige__',
      }),
    ).toMatchObject({
      aiOverviewSection: 'beteiligungseingaenge',
      participationSubtopicId: '__sonstige__',
    });
  });

  it('keeps a valid RPB feedback target while parsing search', () => {
    expect(
      rpbSearchSchema.parse({
        feedbackRating: 'positive',
        feedbackTargetId: 'bewertung-1',
        feedbackTargetType: 'bewertung',
      }),
    ).toMatchObject({
      feedbackRating: 'positive',
      feedbackTargetId: 'bewertung-1',
      feedbackTargetType: 'bewertung',
    });
  });

  it('drops a non-RPB feedback target type and its id while parsing search', () => {
    expect(
      rpbSearchSchema.parse({
        feedbackRating: 'positive',
        feedbackTargetId: 'fundstelle-1',
        feedbackTargetType: 'fundstelle',
      }),
    ).toMatchObject({
      feedbackRating: 'positive',
      feedbackTargetId: undefined,
      feedbackTargetType: undefined,
    });
  });

  it('clears participation subtopic on topic-scoped cleanup', () => {
    expect(
      clearRpbTopicScopedSearch({
        aiOverviewSection: 'beteiligungseingaenge',
        participationSubtopicId: '__sonstige__',
        topicId: 'topic-1',
      }),
    ).toMatchObject({
      aiOverviewSection: 'beteiligungseingaenge',
      participationSubtopicId: undefined,
      topicId: 'topic-1',
    });
  });

  it('preserves the open KI section when changing topic', () => {
    expect(
      setRpbTopicSearch(
        {
          aiOverviewSection: 'beteiligungseingaenge',
          participationSubtopicId: '__sonstige__',
          topicId: 'topic-1',
        },
        'topic-2',
      ),
    ).toMatchObject({
      aiOverviewSection: 'beteiligungseingaenge',
      participationSubtopicId: undefined,
      topicId: 'topic-2',
    });
  });

  it('clears topic-scoped state when selecting a no-topic outline node', () => {
    expect(
      setRpbOutlineSelectionSearch(
        {
          aiLane: 'risikohinweise',
          gesetzId: 'law-1',
          outlineNodeId: 'old-outline',
          participationSubtopicId: '__sonstige__',
          previewDocumentId: 'doc-1',
          selectedFundstelleId: 'fund-1',
          showNormtext: true,
          satzId: 'satz-1',
          topicId: 'topic-1',
          topicNormId: 'topic-norm-1',
        },
        'no-topic-outline',
        undefined,
      ),
    ).toEqual({
      aiLane: 'risikohinweise',
      gesetzId: undefined,
      outlineNodeId: 'no-topic-outline',
      participationSubtopicId: undefined,
      previewDocumentId: undefined,
      selectedFundstelleId: undefined,
      showNormtext: undefined,
      satzId: undefined,
      topicId: undefined,
      topicNormId: undefined,
    });
  });

  it('clears topic-scoped state when clearing the selected topic', () => {
    expect(
      setRpbTopicSearch(
        {
          participationSubtopicId: '__sonstige__',
          topicId: 'topic-1',
        },
        undefined,
      ),
    ).toMatchObject({
      participationSubtopicId: undefined,
      topicId: undefined,
    });
  });
});
