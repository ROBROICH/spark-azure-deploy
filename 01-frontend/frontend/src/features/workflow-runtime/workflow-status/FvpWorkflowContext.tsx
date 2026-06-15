import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { getSubWorkflowStateFromWorkflowState } from './useSubWorkflow';
import {
  WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
  WORKFLOW_TYPE_FVP,
  WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING,
  WORKFLOW_TYPE_LLM_MATCHING,
} from './workflowStatus.helpers';
import { useWorkflow } from './useWorkflow';

const useFvpWorkflowContextLogic = () => {
  const workflowState = useWorkflow({
    workflowType: WORKFLOW_TYPE_FVP,
    includeSubWorkflows: true,
    refetchNodeSummariesOnSuccess: false,
  });
  const tableOfContentsWorkflow = getSubWorkflowStateFromWorkflowState({
    workflowState,
    subWorkflowType: WORKFLOW_TYPE_INHALTSVERZEICHNIS_MATCHING,
  });
  const requiredDocumentsWorkflow = getSubWorkflowStateFromWorkflowState({
    workflowState,
    subWorkflowType: WORKFLOW_TYPE_LLM_MATCHING,
  });
  const plausibilityWorkflow = getSubWorkflowStateFromWorkflowState({
    workflowState,
    subWorkflowType: WORKFLOW_TYPE_CHECK_PLAUSIBILITY,
  });

  return useMemo(
    () => ({
      tableOfContentsWorkflow,
      plausibilityWorkflow,
      requiredDocumentsWorkflow,
      workflowState,
    }),
    [
      tableOfContentsWorkflow,
      plausibilityWorkflow,
      requiredDocumentsWorkflow,
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
