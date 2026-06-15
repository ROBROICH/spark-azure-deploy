import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PlausibilityContradictionListItem } from '@/features/project/fvp/data/plausibility/usePlausibilityContradictions';
import { useFilteredContradictions } from './useContradictions';

const mocks = vi.hoisted(() => ({
  usePlausibilityContradictionsMock: vi.fn(),
}));

vi.mock(
  '@/features/project/fvp/data/plausibility/usePlausibilityContradictions',
  () => ({
    usePlausibilityContradictions: mocks.usePlausibilityContradictionsMock,
  }),
);

const makeContradiction = (
  overrides: Partial<PlausibilityContradictionListItem>,
): PlausibilityContradictionListItem => ({
  id: 'contradiction-1',
  description: 'Contradiction description',
  title: null,
  status: 'OPEN',
  rating: 0.8,
  occurrences: [
    {
      documentId: 'doc-default',
      documentName: 'Default.pdf',
      contentExcerpt: 'Excerpt',
      pageNumber: 1,
    },
  ],
  isOnRequestList: false,
  ...overrides,
});

const mockContradictions = (
  contradictions: PlausibilityContradictionListItem[],
) => {
  mocks.usePlausibilityContradictionsMock.mockReturnValue({
    contradictions,
    isLoading: false,
  });
};

afterEach(() => {
  vi.clearAllMocks();
});

describe('useFilteredContradictions', () => {
  it('derives summary buckets and sorted unique document options', () => {
    mockContradictions([
      makeContradiction({
        id: 'open-requested',
        status: 'OPEN',
        isOnRequestList: true,
        occurrences: [
          {
            documentId: 'doc-z',
            documentName: 'Zeta.pdf',
            contentExcerpt: 'Excerpt',
            pageNumber: 1,
          },
          {
            documentId: 'doc-a',
            documentName: 'Alpha.pdf',
            contentExcerpt: 'Excerpt',
            pageNumber: 2,
          },
        ],
      }),
      makeContradiction({
        id: 'ignored',
        status: 'IGNORED',
        occurrences: [
          {
            documentId: 'doc-a',
            documentName: 'Alpha duplicate.pdf',
            contentExcerpt: 'Excerpt',
            pageNumber: 3,
          },
        ],
      }),
      makeContradiction({
        id: 'resolved',
        status: 'RESOLVED',
      }),
    ]);

    const { result } = renderHook(() =>
      useFilteredContradictions({ projectId: 'project-1' }),
    );

    expect(result.current.summary).toEqual({
      total: 3,
      open: 1,
      onRequestList: 1,
      ignored: 1,
      resolved: 1,
    });
    expect(result.current.documentOptions).toEqual([
      { id: 'doc-a', label: 'Alpha.pdf' },
      { id: 'doc-default', label: 'Default.pdf' },
      { id: 'doc-z', label: 'Zeta.pdf' },
    ]);
  });

  it('clamps the rating threshold to the lowest usable rating', () => {
    mockContradictions([
      makeContradiction({ id: 'keep-high', rating: 0.9 }),
      makeContradiction({ id: 'keep-lowest', rating: 0.5 }),
    ]);

    const { result } = renderHook(() =>
      useFilteredContradictions({
        projectId: 'project-1',
        ratingThreshold: 0.2,
      }),
    );

    expect(result.current.minimumRating).toBe(0.5);
    expect(result.current.contradictions.map((item) => item.id)).toEqual([
      'keep-high',
      'keep-lowest',
    ]);
  });

  it('does not rating-filter when no usable ratings exist', () => {
    mockContradictions([
      makeContradiction({
        id: 'missing-rating',
        description: 'B missing rating',
        rating: null,
      }),
      makeContradiction({
        id: 'also-missing-rating',
        description: 'A also missing rating',
        rating: undefined,
      }),
    ]);

    const { result } = renderHook(() =>
      useFilteredContradictions({
        projectId: 'project-1',
        ratingThreshold: 0.95,
      }),
    );

    expect(result.current.hasUsableRatings).toBe(false);
    expect(result.current.contradictions.map((item) => item.id)).toEqual([
      'missing-rating',
      'also-missing-rating',
    ]);
  });
});
