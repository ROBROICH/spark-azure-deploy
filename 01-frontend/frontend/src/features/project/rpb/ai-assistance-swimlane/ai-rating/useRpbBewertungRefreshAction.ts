import { startBewertungWorkflowWorkflowsBewertungPostMutation } from '@/api-clients/agent-orchestration-module/@tanstack/react-query.gen';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import {
  WORKFLOW_TYPE_BEWERTUNG,
  WORKFLOW_TYPE_SUZ_NORM,
  useRunningWorkflow,
} from '@/features/workflow-runtime/workflow-status/useRunningWorkflow';
import type { WorkflowTypeName } from '@/features/workflow-runtime/workflow-status/useWorkflow';
import { isHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';
import { toast } from '@/features/ui/toast/Toast';
import * as Sentry from '@sentry/react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

export const RPB_BEWERTUNG_WORKFLOW_TYPES: WorkflowTypeName[] = [
  WORKFLOW_TYPE_BEWERTUNG,
  'BewertungOrchestratorWorkflow',
];

export type RpbBewertungRefreshDisabledReason = 'missingTbm' | 'noPermission';

type UseRpbBewertungRefreshActionOptions = {
  canMutateTopic: boolean;
  normId: string | null | undefined;
  verfahrenId: string;
  workflowType?: WorkflowTypeName | WorkflowTypeName[];
};

const getRpbBewertungRefreshDisabledReason = (params: {
  canMutateTopic: boolean;
  hasAtomareTbmDescendant: boolean;
  normId: string | null | undefined;
}): RpbBewertungRefreshDisabledReason | null => {
  if (!params.canMutateTopic) {
    return 'noPermission';
  }

  if (params.normId && !params.hasAtomareTbmDescendant) {
    return 'missingTbm';
  }

  return null;
};

const useRpbBewertungRefreshDisabledReason = (params: {
  canMutateTopic: boolean;
  normId: string | null | undefined;
}) => {
  const normRef = params.normId
    ? { id: params.normId, node_type: 'norm' as const }
    : null;
  const hasAtomareTbmDescendant =
    useDescendants('atomares_tbm', normRef).length > 0;

  return getRpbBewertungRefreshDisabledReason({
    canMutateTopic: params.canMutateTopic,
    hasAtomareTbmDescendant,
    normId: params.normId,
  });
};

const useRpbBewertungWorkflowStates = (options: {
  normId: string | null | undefined;
  verfahrenId: string;
  workflowType: WorkflowTypeName | WorkflowTypeName[];
}) => {
  const { normId, verfahrenId, workflowType } = options;
  const workflowMatchIds = normId
    ? [verfahrenId, normId]
    : ['__missing_norm__'];
  const normRef = normId ? { id: normId, node_type: 'norm' as const } : null;
  const bewertungRefs = useDescendants('bewertung', normRef);
  const {
    isRunning: isBewertungWorkflowRunning,
    isLoading: isBewertungWorkflowStatusLoading,
    observeStarted: observeBewertungWorkflowStarted,
  } = useRunningWorkflow({
    workflowType,
    matchIdsInWorkflowId: workflowMatchIds,
  });
  const {
    isRunning: isSuzNormWorkflowRunning,
    isLoading: isSuzNormWorkflowStatusLoading,
  } = useRunningWorkflow({
    workflowType: WORKFLOW_TYPE_SUZ_NORM,
    matchIdsInWorkflowId: workflowMatchIds,
  });

  return {
    hasSuccessfulBewertungWorkflowRun: bewertungRefs.length > 0,
    isBewertungWorkflowRunning,
    observeBewertungWorkflowStarted,
    isSuzNormWorkflowRunning,
    isWorkflowStatusLoading:
      isBewertungWorkflowStatusLoading || isSuzNormWorkflowStatusLoading,
  };
};

/**
 * Centralizes Bewertung workflow refresh state for RPB norm, sentence, and
 * badge actions so Temporal polling, mutation guards, and error handling stay
 * aligned.
 */
export const useRpbBewertungRefreshAction = (
  options: UseRpbBewertungRefreshActionOptions,
) => {
  const {
    canMutateTopic,
    normId,
    verfahrenId,
    workflowType = RPB_BEWERTUNG_WORKFLOW_TYPES,
  } = options;
  const { t } = useTranslation('Rpb');
  const disabledReason = useRpbBewertungRefreshDisabledReason({
    canMutateTopic,
    normId,
  });
  const {
    hasSuccessfulBewertungWorkflowRun,
    isBewertungWorkflowRunning,
    observeBewertungWorkflowStarted,
    isWorkflowStatusLoading,
    isSuzNormWorkflowRunning,
  } = useRpbBewertungWorkflowStates({
    normId,
    verfahrenId,
    workflowType,
  });
  const startBewertungWorkflowMutation = useMutation(
    startBewertungWorkflowWorkflowsBewertungPostMutation(),
  );
  const isRefreshRunning =
    startBewertungWorkflowMutation.isPending ||
    isBewertungWorkflowRunning ||
    isSuzNormWorkflowRunning;
  const isRefreshDisabled =
    disabledReason !== null ||
    !normId ||
    isRefreshRunning ||
    isWorkflowStatusLoading;

  return {
    disabledReason,
    hasSuccessfulBewertungWorkflowRun,
    isRefreshDisabled,
    isRefreshRunning,
    isWorkflowStatusLoading,
    onRefresh: () => {
      if (isRefreshDisabled || !normId) {
        return;
      }

      startBewertungWorkflowMutation.mutate(
        {
          body: {
            projectId: verfahrenId,
            normId,
          },
        },
        {
          onSuccess: (workflow) => {
            void observeBewertungWorkflowStarted(workflow.parentJobId);
          },
          onError: (error) => {
            if (isHandledProjectVersionConflictError(error)) {
              return;
            }
            Sentry.captureException(error);
            toast.error(t('aiAssistance.startAiAnalysisError'));
          },
        },
      );
    },
  };
};
