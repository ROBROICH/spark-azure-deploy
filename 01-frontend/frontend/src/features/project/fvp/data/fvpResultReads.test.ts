import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  retryDocumentsTableReads,
  retryPlausibilityReads,
  retryRequiredDocumentsReads,
  retryTableOfContentsReads,
} from './fvpResultReads';

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
}));

vi.mock('@/integrations/tanstack-query/root-provider', () => ({
  queryClient: {
    invalidateQueries: mocks.invalidateQueries,
  },
}));

const invalidatedKeys = () =>
  mocks.invalidateQueries.mock.calls.map(([args]) => args.queryKey);

describe('fvpResultReads', () => {
  beforeEach(() => {
    mocks.invalidateQueries.mockClear();
  });

  it('invalidates the table-of-contents reads scoped to the project', () => {
    retryTableOfContentsReads('p1');

    expect(invalidatedKeys()).toEqual([
      ['toc-notes', 'p1'],
      ['toc-notes-response', 'p1'],
      ['request-items', 'p1'],
    ]);
  });

  it('invalidates the required-documents reads scoped to the project', () => {
    retryRequiredDocumentsReads('p1');

    expect(invalidatedKeys()).toEqual([
      ['required-documents', 'p1'],
      ['document-assignments', 'p1'],
      ['request-items', 'p1'],
    ]);
  });

  it('invalidates the plausibility reads scoped to the project', () => {
    retryPlausibilityReads('p1');

    expect(invalidatedKeys()).toEqual([
      ['pp-contradictions', 'p1'],
      ['request-items', 'p1'],
    ]);
  });

  it('invalidates the document table reads scoped to the project', () => {
    retryDocumentsTableReads('p1');

    expect(invalidatedKeys()).toEqual([
      ['files', 'p1'],
      ['required-documents', 'p1'],
      ['document-assignments', 'p1'],
      ['request-items', 'p1'],
    ]);
  });
});
