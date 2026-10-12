import { showMutationErrorToast } from '@/integrations/api-clients/mutationErrorToast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { createCatalogUsecase } from '../data/usecaseApi';
import { getCatalogApiErrorMessage } from './catalogApiError';
import {
  createInitialBeschlussDocument,
  EMPTY_DOKUMENTE,
  EMPTY_GESETZESGRUNDLAGE,
} from './emptyCatalogDocuments';
import { catalogUsecaseQueryKey } from './usecaseQueries';

export type CreateCatalogUsecaseInput = {
  projectTypeId: string;
  projectTypeName: string;
};

export const buildCreateCatalogUsecaseBody = (
  input: CreateCatalogUsecaseInput,
) => ({
  projekttyp: {
    id: input.projectTypeId,
    name: input.projectTypeName,
  },
  gesetzesgrundlage: EMPTY_GESETZESGRUNDLAGE,
  dokumente: EMPTY_DOKUMENTE,
  beschluss: createInitialBeschlussDocument(),
});

/**
 * Pessimistic catalog create for a project type that has no usecase yet.
 * The write waits for the server, then invalidates the usecase query so the
 * editor loads the created document.
 *
 * @returns The mutation that posts an empty catalog with one Beschluss root.
 */
export const useCreateUsecase = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('Administration');

  return useMutation({
    mutationFn: async (input: CreateCatalogUsecaseInput) => {
      await createCatalogUsecase(buildCreateCatalogUsecaseBody(input));
    },
    onSuccess: async (_data, input) => {
      await queryClient.invalidateQueries({
        queryKey: catalogUsecaseQueryKey(input.projectTypeId),
      });
    },
    onError: (error) => {
      const apiMessage = getCatalogApiErrorMessage(error);
      showMutationErrorToast({
        error,
        fallbackMessage: t('catalog.toasts.createError'),
        statusMessages: {
          409: t('catalog.toasts.createConflict'),
          422: apiMessage ?? t('catalog.toasts.invalidCatalog'),
        },
      });
    },
  });
};
