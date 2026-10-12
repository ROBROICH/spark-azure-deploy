import { v1AgentOrchestrationStartRisikohinweiseWorkflowMutation as startRisikohinweiseWorkflowMutation } from '@/api-clients/backend/@tanstack/react-query.gen';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useHasTopicMutationRights } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import {
  WORKFLOW_TYPE_RISIKOHINWEISE,
  useRunningWorkflow,
} from '@/features/workflow-runtime/workflow-status/useRunningWorkflow';
import { toast } from '@/features/ui/toast/Toast';
import * as Sentry from '@sentry/react';
import { useMutation } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useRpbFeatureContext } from '../../workspace-state/RpbFeatureContext';
import { useRpbVaeNodeUrlState } from '../../workspace-state/RpbOutlineContext';
import { canMutateRiskWarningForTopic } from './riskWarningMutationRights';

export type RiskWarningsStartAnalysisDisabledReason =
  | 'noPermission'
  | 'noOutlineNode'
  | 'pendingBeschlussCommit';

export type RiskWarningsStartAnalysisState = {
  disabledReason: RiskWarningsStartAnalysisDisabledReason | null;
  isDisabled: boolean;
  isRunning: boolean;
  start: () => void;
};

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

/**
 * Builds the shared Risikohinweise start-analysis action from the active route
 * section, topic permissions, mutation state, Temporal workflow status, and
 * graph refresh behavior.
 *
 * @returns Start handler plus disabled, disabled-reason, and running state for
 *   AI buttons and trigger cards.
 */
export const useRiskWarningsStartAnalysis =
  (): RiskWarningsStartAnalysisState => {
    const { t } = useTranslation('Rpb');
    const { verfahrenId } = route.useParams();
    const routeOutlineNodeId = route.useSearch({
      select: (search) => search.outlineNodeId,
    });
    const { selectedVaeNode, selectedVaeNodeMutationTopicId } =
      useRpbVaeNodeUrlState();
    const hasTopicMutationRights = useHasTopicMutationRights();
    const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
    const { isBeschlussCommitPending } = useRpbFeatureContext();
    const startRiskAnalysis = useMutation(
      startRisikohinweiseWorkflowMutation(),
    );
    const {
      isRunning: isRisikohinweiseWorkflowRunning,
      observeStarted: observeRisikohinweiseWorkflowStarted,
    } = useRunningWorkflow({
      workflowType: WORKFLOW_TYPE_RISIKOHINWEISE,
      matchIdsInWorkflowId: routeOutlineNodeId
        ? [verfahrenId, routeOutlineNodeId]
        : undefined,
    });

    const canMutateOutlineNode =
      routeOutlineNodeId && selectedVaeNode
        ? canMutateRiskWarningForTopic(selectedVaeNodeMutationTopicId, {
            canMutateProject,
            hasTopicMutationRights,
          })
        : false;
    const isDisabled =
      !routeOutlineNodeId || !canMutateOutlineNode || isBeschlussCommitPending;
    const disabledReason: RiskWarningsStartAnalysisDisabledReason | null =
      !routeOutlineNodeId
        ? 'noOutlineNode'
        : !canMutateOutlineNode
          ? 'noPermission'
          : isBeschlussCommitPending
            ? 'pendingBeschlussCommit'
            : null;
    const isRunning =
      startRiskAnalysis.isPending || isRisikohinweiseWorkflowRunning;

    const start = () => {
      if (isDisabled || !routeOutlineNodeId) {
        return;
      }

      startRiskAnalysis.mutate(
        { body: { projectId: verfahrenId, vaeNodeId: routeOutlineNodeId } },
        {
          onSuccess: (workflow) => {
            void observeRisikohinweiseWorkflowStarted(workflow.parentJobId);
          },
          onError: (error) => {
            Sentry.captureException(error);
            toast.error(t('riskWarnings.startAnalysis.error'));
          },
        },
      );
    };

    return {
      disabledReason,
      isDisabled,
      isRunning,
      start,
    };
  };
