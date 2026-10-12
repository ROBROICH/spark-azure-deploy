import { describe, expect, it } from 'vitest';
import { getFailureReason } from './ewmsFailureReason';

describe('getFailureReason', () => {
  it('shows the generic label for an unknown code and never the raw failure text', () => {
    const reason = getFailureReason({
      filename: 'E0001.pdf',
      errorCode: 'SOME_INTERNAL_ERROR',
      errorMessage: 'IngestFileActivity failed in FileProcessingWorkflow',
    });

    expect(reason).toEqual({
      labelKey: 'fileReviewPage.failureReasons.unknown',
    });
    expect(JSON.stringify(reason)).not.toContain('FileProcessingWorkflow');
  });

  it('labels the per-file codes the document pipeline emits', () => {
    expect(
      getFailureReason({ filename: 'a.pdf', errorCode: 'DUPLICATE_FILE' })
        .labelKey,
    ).toBe('fileReviewPage.failureReasons.duplicate');
    expect(
      getFailureReason({ filename: 'a.pdf', errorCode: 'NO_PROCESSABLE_FILES' })
        .labelKey,
    ).toBe('fileReviewPage.failureReasons.noProcessableFiles');
  });
});
