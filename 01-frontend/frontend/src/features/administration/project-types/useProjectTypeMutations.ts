import {
  v1ProjectLogicCreateProjectTypes as createProjectTypes,
  v1ProjectLogicDeleteProjectTypes as deleteProjectTypes,
  v1ProjectLogicUpdateProjectTypes as updateProjectTypes,
} from '@/api-clients/backend';
import { showMutationErrorToast } from '@/integrations/api-clients/mutationErrorToast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { readCreatedProjectType } from './projectTypeCreateResponse';

type ProjectTypeUpdateInput = {
  id: string;
  name: string;
  active?: boolean;
};

const persistProjectTypeUpdate = async (input: ProjectTypeUpdateInput) => {
  await updateProjectTypes({
    body: [
      {
        id: input.id,
        name: input.name,
        active: input.active,
      },
    ],
    throwOnError: true,
  });
};

/**
 * Pessimistic create/rename/set-active/delete writers for administration
 * project types. Server state is applied only after invalidate+refetch.
 */
export const useProjectTypeMutations = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('Administration');

  const invalidateProjectTypes = async () => {
    await queryClient.invalidateQueries({ queryKey: ['project-types'] });
  };

  const createProjectType = useMutation({
    mutationFn: async (name: string) => {
      const result = await createProjectTypes({
        body: [{ name }],
        throwOnError: true,
      });
      return readCreatedProjectType(result);
    },
    onSuccess: invalidateProjectTypes,
    onError: (error) => {
      showMutationErrorToast({
        error,
        fallbackMessage: t('projectTypes.toasts.createError'),
      });
    },
  });

  const renameProjectType = useMutation({
    mutationFn: persistProjectTypeUpdate,
    onSuccess: invalidateProjectTypes,
    onError: (error) => {
      showMutationErrorToast({
        error,
        fallbackMessage: t('projectTypes.toasts.updateError'),
      });
    },
  });

  const setProjectTypeActive = useMutation({
    mutationFn: persistProjectTypeUpdate,
    onSuccess: invalidateProjectTypes,
    onError: (error) => {
      showMutationErrorToast({
        error,
        fallbackMessage: t('projectTypes.toasts.updateError'),
      });
    },
  });

  const deleteProjectType = useMutation({
    mutationFn: async (id: string) => {
      await deleteProjectTypes({
        query: { ids: [id] },
        throwOnError: true,
      });
    },
    onSuccess: invalidateProjectTypes,
    onError: (error) => {
      showMutationErrorToast({
        error,
        fallbackMessage: t('projectTypes.toasts.deleteError'),
      });
    },
  });

  return {
    createProjectType,
    renameProjectType,
    setProjectTypeActive,
    deleteProjectType,
  };
};
