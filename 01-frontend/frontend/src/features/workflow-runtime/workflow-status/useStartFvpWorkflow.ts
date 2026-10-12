import { v1AgentOrchestrationStartFormalCompletenessWorkflowMutation as startFormalCompletenessWorkflowMutation } from '@/api-clients/backend/@tanstack/react-query.gen';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { toast } from '@/features/ui/toast/Toast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRunningWorkflow, WORKFLOW_TYPE_FVP } from './useRunningWorkflow';

/**
 * Starts the project-scoped FVP workflow after checking canonical mutation
 * rights, then records the optimistic running-workflow observation.
 */
export const useStartFvpWorkflow = (verfahrenId: string) => {
  const { t } = useTranslation('shared');
  const queryClient = useQueryClient();
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const { observeStarted: observeFvpWorkflowStarted } = useRunningWorkflow({
    workflowType: WORKFLOW_TYPE_FVP,
  });
  const orchestrateFvpWorkflowMutation = useMutation(
    startFormalCompletenessWorkflowMutation(),
  );

  const startFvpWorkflow = async () => {
    if (!canMutateProject) {
      throw new Error('Missing project mutation rights for FVP workflow start');
    }

    const workflow = await orchestrateFvpWorkflowMutation.mutateAsync({
      body: {
        projectId: verfahrenId,
      },
    });
    await observeFvpWorkflowStarted(workflow.parentJobId);
    await queryClient.invalidateQueries({ queryKey: ['projects'] });
    toast.success(t('projectNavbar.startProcessSuccess'));
  };

  return {
    startFvpWorkflow,
    isStartingFvpWorkflow: orchestrateFvpWorkflowMutation.isPending,
  };
};
