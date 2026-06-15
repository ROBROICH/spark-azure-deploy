import { describe, expect, it } from 'vitest';

import type { StoredContradiction } from '@/features/project/fvp/data/plausibility/contradiction.schema';
import {
  EXPECTED_MAX_NORMALIZED_RATING,
  EXPECTED_MIN_NORMALIZED_RATING,
  filterContradictions,
  getLowestUsableContradictionRating,
  hasUsableContradictionRatings,
} from './contradictionFilters';

type ContradictionListItem = StoredContradiction & { isOnRequestList: boolean };

const makeContradiction = (
  overrides: Partial<ContradictionListItem>,
): ContradictionListItem => ({
  id: 'contradiction-1',
  description: 'Lorem ipsum contradiction',
  status: 'OPEN',
  occurrences: [
    {
      documentId: 'doc-1',
      documentName: 'Dokument 1',
      contentExcerpt: 'Excerpt',
      pageNumber: 1,
    },
  ],
  isOnRequestList: false,
  ...overrides,
});

describe('filterContradictions', () => {
  it('matches multiple status filters with OR semantics', () => {
    const contradictions = [
      makeContradiction({ id: 'open', status: 'OPEN' }),
      makeContradiction({ id: 'ignored', status: 'IGNORED' }),
      makeContradiction({ id: 'resolved', status: 'RESOLVED' }),
    ];

    const result = filterContradictions(contradictions, {
      statusFilter: 'OPEN,IGNORED',
    });

    expect(result.map((item) => item.id)).toEqual(['open', 'ignored']);
  });

  it('matches status and request-list filters with OR semantics', () => {
    const contradictions = [
      makeContradiction({ id: 'open', status: 'OPEN', isOnRequestList: false }),
      makeContradiction({
        id: 'request-list',
        status: 'RESOLVED',
        isOnRequestList: true,
      }),
      makeContradiction({
        id: 'excluded',
        status: 'RESOLVED',
        isOnRequestList: false,
      }),
    ];

    const result = filterContradictions(contradictions, {
      statusFilter: 'OPEN,ON_REQUEST_LIST',
    });

    expect(result.map((item) => item.id)).toEqual(['open', 'request-list']);
  });

  it('sorts contradictions by rating descending after filtering', () => {
    const contradictions = [
      makeContradiction({ id: 'medium', rating: 0.78 }),
      makeContradiction({ id: 'high', rating: 92 }),
      makeContradiction({ id: 'low', rating: 0.67 }),
    ];

    const result = filterContradictions(contradictions, {});

    expect(result.map((item) => item.id)).toEqual(['high', 'medium', 'low']);
  });

  it('moves contradictions without rating behind rated contradictions', () => {
    const contradictions = [
      makeContradiction({ id: 'missing', rating: null }),
      makeContradiction({ id: 'rated', rating: 0.81 }),
    ];

    const result = filterContradictions(contradictions, {});

    expect(result.map((item) => item.id)).toEqual(['rated', 'missing']);
  });

  it('filters contradictions by the rating threshold', () => {
    const contradictions = [
      makeContradiction({ id: 'keep', rating: 0.9 }),
      makeContradiction({ id: 'drop', rating: 0.7 }),
    ];

    const result = filterContradictions(contradictions, {
      ratingThreshold: 0.8,
    });

    expect(result.map((item) => item.id)).toEqual(['keep']);
  });

  it('filters contradictions by matching document ids', () => {
    const contradictions = [
      makeContradiction({
        id: 'doc-a',
        occurrences: [
          {
            documentId: 'uuid-a',
            documentName: 'folder/a.pdf',
            contentExcerpt: 'Excerpt',
            pageNumber: 1,
          },
        ],
      }),
      makeContradiction({
        id: 'doc-b',
        occurrences: [
          {
            documentId: 'uuid-b',
            documentName: 'folder/b.pdf',
            contentExcerpt: 'Excerpt',
            pageNumber: 1,
          },
        ],
      }),
    ];

    const result = filterContradictions(contradictions, {
      documentFilter: 'uuid-b',
    });

    expect(result.map((item) => item.id)).toEqual(['doc-b']);
  });

  it('filters contradictions by matching row titles', () => {
    const contradictions = [
      makeContradiction({
        id: 'title-match',
        title: 'Abweichende Flächenbilanz',
        description: 'Unrelated text',
      }),
      makeContradiction({
        id: 'description-match',
        title: null,
        description: 'Abweichende Schutzgutbewertung',
      }),
      makeContradiction({ id: 'excluded', description: 'Other text' }),
    ];

    const result = filterContradictions(contradictions, {
      search: 'abweichende',
    });

    expect(result.map((item) => item.id)).toEqual([
      'title-match',
      'description-match',
    ]);
  });

  it('sorts equal-rated contradictions by row title with description fallback', () => {
    const contradictions = [
      makeContradiction({
        id: 'description-fallback',
        title: null,
        description: 'B Beschreibung',
        rating: 0.8,
      }),
      makeContradiction({
        id: 'title',
        title: 'A Titel',
        description: 'Z Beschreibung',
        rating: 0.8,
      }),
    ];

    const result = filterContradictions(contradictions, {});

    expect(result.map((item) => item.id)).toEqual([
      'title',
      'description-fallback',
    ]);
  });

  it('applies a provided minimum rating threshold', () => {
    const contradictions = [
      makeContradiction({ id: 'keep', rating: EXPECTED_MIN_NORMALIZED_RATING }),
      makeContradiction({ id: 'drop', rating: 0.72 }),
    ];

    const result = filterContradictions(contradictions, {
      ratingThreshold: EXPECTED_MIN_NORMALIZED_RATING,
    });

    expect(result.map((item) => item.id)).toEqual(['drop', 'keep']);
  });
});

describe('hasUsableContradictionRatings', () => {
  it('returns true when at least one finite rating is available', () => {
    const result = hasUsableContradictionRatings([
      makeContradiction({ rating: EXPECTED_MAX_NORMALIZED_RATING }),
      makeContradiction({ rating: null }),
    ]);

    expect(result).toBe(true);
  });

  it('returns false when no finite ratings are available', () => {
    const result = hasUsableContradictionRatings([
      makeContradiction({ rating: null }),
    ]);

    expect(result).toBe(false);
  });
});

describe('getLowestUsableContradictionRating', () => {
  it('returns the lowest finite normalized rating', () => {
    const result = getLowestUsableContradictionRating([
      makeContradiction({ rating: 92 }),
      makeContradiction({ rating: 0.6 }),
      makeContradiction({ rating: null }),
    ]);

    expect(result).toBe(0.6);
  });

  it('returns undefined when no usable rating is available', () => {
    const result = getLowestUsableContradictionRating([
      makeContradiction({ rating: null }),
    ]);

    expect(result).toBeUndefined();
  });
});
