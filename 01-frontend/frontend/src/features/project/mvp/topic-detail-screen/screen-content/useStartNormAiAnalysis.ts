import { startSuzNormWorkflowWorkflowsSuzNormIdPostMutation } from '@/api-clients/agent-orchestration-module/@tanstack/react-query.gen';
import { toast } from '@/features/ui/toast/Toast';
import { isHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';
import * as Sentry from '@sentry/react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

type UseStartNormAiAnalysisOptions = {
  canMutateTopic: boolean;
  canStartAiAnalysis: boolean;
  hasAtomareTbmDescendant: boolean;
  normId: string;
  observeSuzWorkflowStarted: (workflowId: string) => void;
  verfahrenId: string;
};

export const useStartNormAiAnalysis = (
  options: UseStartNormAiAnalysisOptions,
) => {
  const {
    canMutateTopic,
    canStartAiAnalysis,
    hasAtomareTbmDescendant,
    normId,
    observeSuzWorkflowStarted,
    verfahrenId,
  } = options;
  const { t } = useTranslation('MvpRedesign');
  const mutation = useMutation(
    startSuzNormWorkflowWorkflowsSuzNormIdPostMutation(),
  );

  const startAiAnalysis = () => {
    if (!canMutateTopic || !canStartAiAnalysis || !hasAtomareTbmDescendant) {
      return;
    }

    mutation.mutate(
      {
        path: {
          norm_id: normId,
        },
        body: {
          projectId: verfahrenId,
        },
      },
      {
        onSuccess: (workflow) =>
          void observeSuzWorkflowStarted(workflow.parentJobId),
        onError: (error) => {
          if (isHandledProjectVersionConflictError(error)) {
            return;
          }
          Sentry.captureException(error);
          toast.error(t('NormCardItem.startAiAnalysisError'));
        },
      },
    );
  };

  return {
    isPending: mutation.isPending,
    startAiAnalysis,
  };
};
