import type { useSubWorkflow } from './useSubWorkflow';
import type {
  WorkflowFailure,
  WorkflowFailureCode,
} from './workflowStatus.types';

type FvpAnalysisState = Pick<
  ReturnType<typeof useSubWorkflow>,
  | 'failureCode'
  | 'hasCompletedRun'
  | 'isError'
  | 'isStatusLoading'
  | 'subWorkflows'
>;

type FvpAnalysisStates = {
  tableOfContents: FvpAnalysisState;
  requiredDocuments: FvpAnalysisState;
  plausibility: FvpAnalysisState;
};

// Branch identifiers the FVPWorkflow failure details use. A failed content
// extraction stops the run before any analysis starts; a failed extraction
// follow-up step lets the analyses run, so it must not mark them.
const FVP_CONTENT_EXTRACTION_BRANCH = 'inhaltsextraktion';
const FVP_ANALYSIS_BRANCHES = {
  tableOfContents: 'inhaltsverzeichnismatching',
  requiredDocuments: 'formalpruefung',
  plausibility: 'plausibilitaetspruefung',
} as const satisfies Record<keyof FvpAnalysisStates, string>;

const getAnalysisFailureCode = (args: {
  analysis: FvpAnalysisState;
  branch: string;
  hasStartedAnalysis: boolean;
  parentFailure: WorkflowFailure | null;
}): WorkflowFailureCode | null => {
  const { analysis, branch, hasStartedAnalysis, parentFailure } = args;
  // The child summary carries its own failure, so a failed analysis run wins.
  if (analysis.failureCode !== null) {
    return analysis.failureCode;
  }
  if (parentFailure === null) {
    return null;
  }
  // A failed content extraction marks every analysis. Any other failure before
  // an analysis started marks only the branches it names, or every analysis
  // when it names none (below).
  const extractionFailure = hasStartedAnalysis
    ? undefined
    : parentFailure.branches.find(
        (entry) => entry.branch === FVP_CONTENT_EXTRACTION_BRANCH,
      );
  if (extractionFailure) {
    return extractionFailure.errorCode;
  }
  // Only the parent failure names a branch whose result delivery failed after
  // its child completed, or a branch that never produced a child summary.
  const ownBranchFailure = parentFailure.branches.find(
    (entry) => entry.branch === branch,
  );
  if (ownBranchFailure) {
    return ownBranchFailure.errorCode;
  }
  // A run-level failure without branch detail (timeout, cancellation) stopped
  // every analysis that had not completed.
  return parentFailure.branches.length === 0 && !analysis.hasCompletedRun
    ? parentFailure.errorCode
    : null;
};

/**
 * Derives the failure code of each FVP analysis from its own latest child run
 * and, where that child cannot tell, from the parent FVPWorkflow failure.
 */
export const getFvpAnalysisFailureCodes = (args: {
  analyses: FvpAnalysisStates;
  parentFailure: WorkflowFailure | null;
}): Record<keyof FvpAnalysisStates, WorkflowFailureCode | null> => {
  const { analyses } = args;
  const stages = Object.values(analyses);
  const hasStartedAnalysis = stages.some(
    ({ subWorkflows }) => subWorkflows.length > 0,
  );
  // Empty stage lists mean "not started" only once every stage read settled.
  // While a read is pending or failed, the parent failure cannot be assigned
  // to an analysis, so only each stage's own failure is reported.
  const areStageReadsKnown = stages.every(
    ({ isError, isStatusLoading }) => !isError && !isStatusLoading,
  );
  const parentFailure = areStageReadsKnown ? args.parentFailure : null;
  const failureCodeFor = (key: keyof FvpAnalysisStates) =>
    getAnalysisFailureCode({
      analysis: analyses[key],
      branch: FVP_ANALYSIS_BRANCHES[key],
      hasStartedAnalysis,
      parentFailure,
    });

  return {
    tableOfContents: failureCodeFor('tableOfContents'),
    requiredDocuments: failureCodeFor('requiredDocuments'),
    plausibility: failureCodeFor('plausibility'),
  };
};
