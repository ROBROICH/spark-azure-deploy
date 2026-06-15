import { refetchProjectNodeTreeAndPayloads } from '@/db/nodes/collections/reloadProjectNodeTreeAndPayloads';
import { useProjectRouteVersion } from '@/features/project/versioning/projectVersioning';
import { useCallback, useEffect, useRef } from 'react';

const EWMS_WORKFLOW_REFRESH_INTERVAL_MS = 10_000;

const refreshEwmsWorkflowData = async (
  projectId: string,
  projectVersion: number,
) => {
  await refetchProjectNodeTreeAndPayloads(projectId, projectVersion);
};

export const useEwmsWorkflowDataRefresh = (params: {
  isEwmsWorkflowRunning: boolean;
  projectId: string;
  shouldRefreshProcessingData: boolean;
}) => {
  const { isEwmsWorkflowRunning, projectId, shouldRefreshProcessingData } =
    params;
  const projectVersion = useProjectRouteVersion();
  const wasEwmsWorkflowRunningRef = useRef(false);
  const shouldRefresh = isEwmsWorkflowRunning && shouldRefreshProcessingData;
  // eslint-disable-next-line no-restricted-syntax -- the interval and final-settle effects need one stable refresh command for their lifecycles.
  const refreshProcessingData = useCallback(() => {
    void refreshEwmsWorkflowData(projectId, projectVersion);
  }, [projectId, projectVersion]);

  // eslint-disable-next-line no-restricted-syntax -- EWMS node data can change while Temporal is running, so EWMS refreshes graph and payload data in the background.
  useEffect(() => {
    if (!shouldRefresh) {
      return;
    }

    refreshProcessingData();

    const intervalId = window.setInterval(() => {
      refreshProcessingData();
    }, EWMS_WORKFLOW_REFRESH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [refreshProcessingData, shouldRefresh]);

  // eslint-disable-next-line no-restricted-syntax -- Temporal can stop reporting EWMS as running before the final node payload snapshot has been pulled; refresh once more so classification_status and new argument refs can settle.
  useEffect(() => {
    const wasEwmsWorkflowRunning = wasEwmsWorkflowRunningRef.current;
    wasEwmsWorkflowRunningRef.current = isEwmsWorkflowRunning;

    if (
      wasEwmsWorkflowRunning &&
      !isEwmsWorkflowRunning &&
      shouldRefreshProcessingData
    ) {
      refreshProcessingData();
    }
  }, [
    isEwmsWorkflowRunning,
    refreshProcessingData,
    shouldRefreshProcessingData,
  ]);
};
