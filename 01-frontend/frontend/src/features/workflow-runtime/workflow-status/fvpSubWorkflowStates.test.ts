import type { WorkflowsBase } from '@/api-clients/backend/types.gen';
import { describe, expect, it } from 'vitest';
import { getFvpAnalysisFailureCodes } from './fvpSubWorkflowStates';
import type { WorkflowFailureCode } from './workflowStatus.types';

type Analysis = Parameters<
  typeof getFvpAnalysisFailureCodes
>[0]['analyses']['tableOfContents'];

const stageRun = { workflowId: 'stage' } as WorkflowsBase;

const settled = { isError: false, isStatusLoading: false };
const notStarted: Analysis = {
  ...settled,
  failureCode: null,
  hasCompletedRun: false,
  subWorkflows: [],
};
const completed: Analysis = {
  ...settled,
  failureCode: null,
  hasCompletedRun: true,
  subWorkflows: [stageRun],
};
const failedWith = (failureCode: WorkflowFailureCode): Analysis => ({
  ...settled,
  failureCode,
  hasCompletedRun: false,
  subWorkflows: [stageRun],
});
const pending: Analysis = { ...notStarted, isStatusLoading: true };
const unreadable: Analysis = { ...notStarted, isError: true };

const extractionFailure = {
  errorCode: 'ANALYSIS_FAILED' as const,
  branches: [
    { branch: 'inhaltsextraktion', errorCode: 'ANALYSIS_TIMED_OUT' as const },
  ],
};

describe('getFvpAnalysisFailureCodes', () => {
  it('marks every analysis failed when the content extraction stopped the run', () => {
    expect(
      getFvpAnalysisFailureCodes({
        analyses: {
          tableOfContents: notStarted,
          requiredDocuments: notStarted,
          plausibility: notStarted,
        },
        parentFailure: extractionFailure,
      }),
    ).toEqual({
      tableOfContents: 'ANALYSIS_TIMED_OUT',
      requiredDocuments: 'ANALYSIS_TIMED_OUT',
      plausibility: 'ANALYSIS_TIMED_OUT',
    });
  });

  it('marks only the named analyses when the run failed before any analysis started', () => {
    expect(
      getFvpAnalysisFailureCodes({
        analyses: {
          tableOfContents: notStarted,
          requiredDocuments: notStarted,
          plausibility: notStarted,
        },
        parentFailure: {
          errorCode: 'ANALYSIS_FAILED',
          branches: [
            { branch: 'formalpruefung', errorCode: 'ANALYSIS_TIMED_OUT' },
            { branch: 'plausibilitaetspruefung', errorCode: 'ANALYSIS_FAILED' },
          ],
        },
      }),
    ).toEqual({
      tableOfContents: null,
      requiredDocuments: 'ANALYSIS_TIMED_OUT',
      plausibility: 'ANALYSIS_FAILED',
    });
  });

  it('does not mark analyses for an extraction follow-up failure once an analysis started', () => {
    expect(
      getFvpAnalysisFailureCodes({
        analyses: {
          tableOfContents: completed,
          requiredDocuments: completed,
          plausibility: notStarted,
        },
        parentFailure: extractionFailure,
      }),
    ).toEqual({
      tableOfContents: null,
      requiredDocuments: null,
      plausibility: null,
    });
  });

  it('prefers the failure of the analysis child run over the parent details', () => {
    expect(
      getFvpAnalysisFailureCodes({
        analyses: {
          tableOfContents: failedWith('ANALYSIS_CANCELED'),
          requiredDocuments: completed,
          plausibility: notStarted,
        },
        parentFailure: {
          errorCode: 'ANALYSIS_FAILED',
          branches: [
            {
              branch: 'inhaltsverzeichnismatching',
              errorCode: 'ANALYSIS_FAILED',
            },
            {
              branch: 'plausibilitaetspruefung',
              errorCode: 'ANALYSIS_FAILED',
            },
          ],
        },
      }),
    ).toEqual({
      tableOfContents: 'ANALYSIS_CANCELED',
      requiredDocuments: null,
      plausibility: 'ANALYSIS_FAILED',
    });
  });

  it('applies a run-level failure only to analyses that had not completed', () => {
    expect(
      getFvpAnalysisFailureCodes({
        analyses: {
          tableOfContents: completed,
          requiredDocuments: completed,
          plausibility: notStarted,
        },
        parentFailure: { errorCode: 'ANALYSIS_TIMED_OUT', branches: [] },
      }),
    ).toEqual({
      tableOfContents: null,
      requiredDocuments: null,
      plausibility: 'ANALYSIS_TIMED_OUT',
    });
  });

  it('does not mark an analysis the run skipped when the parent names only other branches', () => {
    expect(
      getFvpAnalysisFailureCodes({
        analyses: {
          tableOfContents: notStarted,
          requiredDocuments: failedWith('ANALYSIS_FAILED'),
          plausibility: notStarted,
        },
        parentFailure: {
          errorCode: 'ANALYSIS_FAILED',
          branches: [
            { branch: 'formalpruefung', errorCode: 'ANALYSIS_FAILED' },
            { branch: 'plausibilitaetspruefung', errorCode: 'ANALYSIS_FAILED' },
          ],
        },
      }),
    ).toEqual({
      tableOfContents: null,
      requiredDocuments: 'ANALYSIS_FAILED',
      plausibility: 'ANALYSIS_FAILED',
    });
  });

  it('marks an analysis whose child completed when the parent names its branch for a failed delivery', () => {
    expect(
      getFvpAnalysisFailureCodes({
        analyses: {
          tableOfContents: completed,
          requiredDocuments: completed,
          plausibility: notStarted,
        },
        parentFailure: {
          errorCode: 'ANALYSIS_FAILED',
          branches: [
            { branch: 'formalpruefung', errorCode: 'ANALYSIS_TIMED_OUT' },
            { branch: 'plausibilitaetspruefung', errorCode: 'ANALYSIS_FAILED' },
          ],
        },
      }),
    ).toEqual({
      tableOfContents: null,
      requiredDocuments: 'ANALYSIS_TIMED_OUT',
      plausibility: 'ANALYSIS_FAILED',
    });
  });

  it('reports no failure without a parent or child failure', () => {
    expect(
      getFvpAnalysisFailureCodes({
        analyses: {
          tableOfContents: notStarted,
          requiredDocuments: notStarted,
          plausibility: notStarted,
        },
        parentFailure: null,
      }),
    ).toEqual({
      tableOfContents: null,
      requiredDocuments: null,
      plausibility: null,
    });
  });

  it('assigns no parent-derived failure while stage reads are still pending', () => {
    expect(
      getFvpAnalysisFailureCodes({
        analyses: {
          tableOfContents: pending,
          requiredDocuments: pending,
          plausibility: pending,
        },
        parentFailure: {
          errorCode: 'ANALYSIS_FAILED',
          branches: [
            {
              branch: 'plausibilitaetspruefung',
              errorCode: 'ANALYSIS_FAILED',
            },
          ],
        },
      }),
    ).toEqual({
      tableOfContents: null,
      requiredDocuments: null,
      plausibility: null,
    });
  });

  it('treats a failed stage read as unknown, not as not started, and keeps own stage failures', () => {
    expect(
      getFvpAnalysisFailureCodes({
        analyses: {
          tableOfContents: unreadable,
          requiredDocuments: unreadable,
          plausibility: unreadable,
        },
        parentFailure: extractionFailure,
      }),
    ).toEqual({
      tableOfContents: null,
      requiredDocuments: null,
      plausibility: null,
    });
    expect(
      getFvpAnalysisFailureCodes({
        analyses: {
          tableOfContents: unreadable,
          requiredDocuments: failedWith('ANALYSIS_TIMED_OUT'),
          plausibility: notStarted,
        },
        parentFailure: extractionFailure,
      }),
    ).toEqual({
      tableOfContents: null,
      requiredDocuments: 'ANALYSIS_TIMED_OUT',
      plausibility: null,
    });
  });
});
