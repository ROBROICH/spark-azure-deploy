import { startSuzNormWorkflowWorkflowsSuzNormIdPostMutation } from '@/api-clients/agent-orchestration-module/@tanstack/react-query.gen';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useHasTopicMutationRights } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import {
  WORKFLOW_TYPE_BEWERTUNG,
  WORKFLOW_TYPE_SUZ_NORM,
  useRunningWorkflow,
} from '@/features/workflow-runtime/workflow-status/useRunningWorkflow';
import { isHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';
import { toast } from '@/features/ui/toast/Toast';
import * as Sentry from '@sentry/react';
import { useMutation } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

/**
 * Builds the MVP norm refresh action and tracks the SUZ/Bewertung workflows
 * that can make the same Fundstellen result stale while a refresh is running.
 */
export const useMvpNormRefreshAction = (normId: string) => {
  const { topicName, verfahrenId } = route.useParams();
  const { t } = useTranslation('MvpRedesign');
  const hasTopicMutationRights = useHasTopicMutationRights();
  const canMutateTopic = hasTopicMutationRights(topicName);
  const atomareTbmRefs = useDescendants('atomares_tbm', {
    id: normId,
    node_type: 'norm' as const,
  });
  const hasAtomareTbmDescendant = atomareTbmRefs.length > 0;
  const {
    isRunning: isSuzWorkflowRunning,
    isLoading: isSuzWorkflowLoading,
    isError: isSuzWorkflowError,
    observeStarted: observeSuzWorkflowStarted,
  } = useRunningWorkflow({
    workflowType: WORKFLOW_TYPE_SUZ_NORM,
    matchIdsInWorkflowId: [verfahrenId, normId],
  });
  const {
    isRunning: isBewertungWorkflowRunning,
    isLoading: isBewertungWorkflowLoading,
    isError: isBewertungWorkflowError,
  } = useRunningWorkflow({
    workflowType: WORKFLOW_TYPE_BEWERTUNG,
    matchIdsInWorkflowId: [verfahrenId, normId],
  });
  const startSuzNormWorkflowMutation = useMutation(
    startSuzNormWorkflowWorkflowsSuzNormIdPostMutation(),
  );
  const isRefreshRunning =
    startSuzNormWorkflowMutation.isPending ||
    isSuzWorkflowRunning ||
    isBewertungWorkflowRunning;
  const isRefreshStatusUnavailable =
    isSuzWorkflowLoading ||
    isBewertungWorkflowLoading ||
    isSuzWorkflowError ||
    isBewertungWorkflowError;
  const isRefreshDisabled =
    !canMutateTopic ||
    !hasAtomareTbmDescendant ||
    isRefreshRunning ||
    isRefreshStatusUnavailable;

  return {
    isRefreshDisabled,
    isRefreshRunning,
    onRefresh: () => {
      if (isRefreshDisabled) {
        return;
      }

      startSuzNormWorkflowMutation.mutate(
        {
          path: { norm_id: normId },
          body: { projectId: verfahrenId },
        },
        {
          onSuccess: (workflow) =>
            void observeSuzWorkflowStarted(workflow.parentJobId),
          onError: (error) => {
            if (isHandledProjectVersionConflictError(error)) {
              return;
            }
            Sentry.captureException(error);
            toast.error(t('AiRefresh.startAiAnalysisError'));
          },
        },
      );
    },
  };
};
