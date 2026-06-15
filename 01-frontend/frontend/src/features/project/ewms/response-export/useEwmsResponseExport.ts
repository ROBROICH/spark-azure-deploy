import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useProjectRouteVersion } from '@/features/project/versioning/projectVersioning';
import { toast } from '@/features/ui/toast/Toast';
import * as Sentry from '@sentry/react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  exportErwiderungen,
  triggerErwiderungExportDownload,
} from './exportErwiderungen';

/**
 * Runs the EWMS Erwiderung export and hands the generated DMS download URL to
 * the browser download flow.
 */
export const useEwmsResponseExport = (projectId: string) => {
  const { t } = useTranslation('Ewms');
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const projectVersion = useProjectRouteVersion();
  const exportMutation = useMutation({
    mutationFn: () => exportErwiderungen(projectId, projectVersion),
    onSuccess: (downloadUrl) => {
      triggerErwiderungExportDownload(downloadUrl);
      toast.success(t('toolbar.exportStarted'));
    },
    onError: (error) => {
      Sentry.captureException(error, {
        tags: {
          area: 'ewms',
          flow: 'erwiderung-export',
        },
        extra: {
          projectId,
        },
      });
      toast.error(t('toolbar.exportError'));
    },
  });

  return {
    handleExportResponses: () => {
      if (!canMutateProject) {
        return;
      }

      exportMutation.mutate();
    },
    isExportingResponses: exportMutation.isPending,
  };
};
