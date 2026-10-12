import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { getFvpAnalysisFailureCodes } from './fvpSubWorkflowStates';
import { useSubWorkflow } from './useSubWorkflow';
import {
  WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
  WORKFLOW_TYPE_FVP,
  WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING,
  WORKFLOW_TYPE_LLM_MATCHING,
} from './workflowStatus.helpers';
import { useWorkflow } from './useWorkflow';

/**
 * Reads the latest FVPWorkflow run and its three analysis stages once for the
 * FVP route, and attaches each analysis's failure code.
 */
const useFvpWorkflowContextLogic = () => {
  const workflowState = useWorkflow({
    workflowType: WORKFLOW_TYPE_FVP,
    refetchNodeSummariesOnSuccess: false,
  });
  const tableOfContentsRun = useSubWorkflow({
    workflowState,
    subWorkflowType: WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING,
  });
  const requiredDocumentsRun = useSubWorkflow({
    workflowState,
    subWorkflowType: WORKFLOW_TYPE_LLM_MATCHING,
  });
  const plausibilityRun = useSubWorkflow({
    workflowState,
    subWorkflowType: WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
  });
  const failureCodes = getFvpAnalysisFailureCodes({
    analyses: {
      tableOfContents: tableOfContentsRun,
      requiredDocuments: requiredDocumentsRun,
      plausibility: plausibilityRun,
    },
    parentFailure: workflowState.latestFailure,
  });

  return useMemo(
    () => ({
      tableOfContentsWorkflow: {
        ...tableOfContentsRun,
        failureCode: failureCodes.tableOfContents,
      },
      plausibilityWorkflow: {
        ...plausibilityRun,
        failureCode: failureCodes.plausibility,
      },
      requiredDocumentsWorkflow: {
        ...requiredDocumentsRun,
        failureCode: failureCodes.requiredDocuments,
      },
      workflowState,
    }),
    [
      tableOfContentsRun,
      plausibilityRun,
      requiredDocumentsRun,
      failureCodes.tableOfContents,
      failureCodes.plausibility,
      failureCodes.requiredDocuments,
      workflowState,
    ],
  );
};

type FvpWorkflowContextValue = ReturnType<typeof useFvpWorkflowContextLogic>;

const FvpWorkflowContext = createContext<FvpWorkflowContextValue | null>(null);

export const FvpWorkflowProvider = (props: { children: ReactNode }) => {
  const value = useFvpWorkflowContextLogic();

  return (
    <FvpWorkflowContext.Provider value={value}>
      {props.children}
    </FvpWorkflowContext.Provider>
  );
};

export const useFvpWorkflowContext = () => {
  const value = useContext(FvpWorkflowContext);

  if (value === null) {
    throw new Error(
      'useFvpWorkflowContext must be used inside FvpWorkflowProvider',
    );
  }

  return value;
};
