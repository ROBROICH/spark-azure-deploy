import { showMutationErrorToast } from '@/integrations/api-clients/mutationErrorToast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { catalogUsecaseQueryKey } from '../catalog/usecaseQueries';
import { duplicateProjectType } from './duplicateProjectType';
import {
  isPartialProjectTypeCloneError,
  isProjectTypeCloneDocumentsError,
} from './duplicateProjectType.errors';

/**
 * Pessimistic project-type duplication. Success invalidates the project-type
 * list and the new catalog query. Partial clones never report success.
 */
export const useDuplicateProjectType = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('Administration');

  const invalidateProjectTypes = async () => {
    await queryClient.invalidateQueries({ queryKey: ['project-types'] });
  };

  return useMutation({
    mutationFn: duplicateProjectType,
    onSuccess: async (created) => {
      await invalidateProjectTypes();
      await queryClient.invalidateQueries({
        queryKey: catalogUsecaseQueryKey(created.id),
      });
    },
    onError: async (error) => {
      await invalidateProjectTypes();

      if (isPartialProjectTypeCloneError(error)) {
        showMutationErrorToast({
          error,
          fallbackMessage: t('projectTypes.toasts.duplicateRollbackFailed', {
            name: error.projectTypeName,
          }),
        });
        return;
      }

      if (isProjectTypeCloneDocumentsError(error)) {
        showMutationErrorToast({
          error,
          fallbackMessage: t('projectTypes.toasts.duplicateDocumentsError'),
        });
        return;
      }

      showMutationErrorToast({
        error,
        fallbackMessage: t('projectTypes.toasts.duplicateError'),
      });
    },
  });
};
