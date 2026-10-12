export type EwmsViewState = 'landing' | 'processing' | 'workspace';

export const resolveEwmsViewState = (params: {
  hasFirstSwimlaneData: boolean;
  isWorkflowRunning: boolean;
}): EwmsViewState => {
  const { hasFirstSwimlaneData, isWorkflowRunning } = params;

  if (isWorkflowRunning) {
    return hasFirstSwimlaneData ? 'workspace' : 'processing';
  }

  if (hasFirstSwimlaneData) {
    return 'workspace';
  }

  return 'landing';
};
