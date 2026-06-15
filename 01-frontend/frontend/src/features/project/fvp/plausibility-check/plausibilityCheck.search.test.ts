import { describe, expect, it } from 'vitest';
import { plausibilityCheckSearchSchema } from './plausibilityCheck.search';

describe('plausibilityCheckSearchSchema', () => {
  it('keeps valid copied URL search state', () => {
    expect(
      plausibilityCheckSearchSchema.parse({
        search: 'wasser',
        statusFilter: 'OPEN,ON_REQUEST_LIST',
        documentFilter: 'doc-1,doc-2',
        expandedContradictionId: 'contradiction-1',
        previewDocumentId: 'doc-2',
        previewPageNumber: 3,
        leftOccurrenceIndex: 0,
        rightOccurrenceIndex: 1,
      }),
    ).toEqual({
      search: 'wasser',
      statusFilter: 'OPEN,ON_REQUEST_LIST',
      documentFilter: 'doc-1,doc-2',
      expandedContradictionId: 'contradiction-1',
      previewDocumentId: 'doc-2',
      previewPageNumber: 3,
      leftOccurrenceIndex: 0,
      rightOccurrenceIndex: 1,
    });
  });

  it('strips the retired rating threshold search param', () => {
    expect(
      plausibilityCheckSearchSchema.parse({
        search: 'wasser',
        ratingThreshold: 0.57,
      }),
    ).toEqual({
      search: 'wasser',
    });
  });
});
