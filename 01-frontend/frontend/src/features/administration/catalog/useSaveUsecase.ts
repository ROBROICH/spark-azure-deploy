import { showMutationErrorToast } from '@/integrations/api-clients/mutationErrorToast';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import {
  updateCatalogUsecase,
  type Usecase,
  type UsecaseWrite,
} from '../data/usecaseApi';
import {
  getCatalogApiErrorMessage,
  isCatalogConflictError,
} from './catalogApiError';
import {
  catalogUsecaseQueryKey,
  type CatalogUsecaseQueryResult,
} from './usecaseQueries';
import { readUsecaseResponse } from './usecaseResponse';

export type UsecaseDocumentPatch = Partial<
  Pick<
    UsecaseWrite,
    'projekttyp' | 'gesetzesgrundlage' | 'dokumente' | 'beschluss'
  >
>;

export type UsecaseSave = {
  snapshot: Usecase;
  patch: UsecaseDocumentPatch;
};

const buildUsecaseWriteBody = ({
  snapshot: usecase,
  patch,
}: UsecaseSave): Usecase => {
  return {
    slug: usecase.slug,
    projekttyp: patch.projekttyp ?? usecase.projekttyp,
    gesetzesgrundlage: patch.gesetzesgrundlage ?? usecase.gesetzesgrundlage,
    dokumente: patch.dokumente ?? usecase.dokumente,
    beschluss: patch.beschluss ?? usecase.beschluss,
    updatedAt: usecase.updatedAt,
  };
};

/**
 * Pessimistic catalog save. Builds a full PUT from the usecase snapshot the
 * draft was opened from plus one patched document slice, keeping that
 * snapshot's revision, so a newer server revision answers 409 instead of
 * being overwritten. Waits for the server, then invalidates the usecase query.
 *
 * @param usecaseId Selected project type / catalog usecase id.
 * @returns The mutation that persists one document slice.
 */
export const useSaveUsecase = (usecaseId: string | undefined) => {
  const queryClient = useQueryClient();
  const { t } = useTranslation('Administration');

  return useMutation({
    mutationFn: async (save: UsecaseSave) => {
      if (!usecaseId) {
        throw new Error('Catalog usecase id is missing');
      }

      const body = buildUsecaseWriteBody(save);
      const result = await updateCatalogUsecase(usecaseId, body);
      return readUsecaseResponse(result);
    },
    onSuccess: async (savedUsecase) => {
      if (!usecaseId) {
        return;
      }

      queryClient.setQueryData<CatalogUsecaseQueryResult>(
        catalogUsecaseQueryKey(usecaseId),
        { kind: 'ready', usecase: savedUsecase },
      );
      await queryClient.invalidateQueries({
        queryKey: catalogUsecaseQueryKey(usecaseId),
      });
    },
    onError: async (error) => {
      if (usecaseId && isCatalogConflictError(error)) {
        await queryClient.invalidateQueries({
          queryKey: catalogUsecaseQueryKey(usecaseId),
        });
      }

      const apiMessage = getCatalogApiErrorMessage(error);
      showMutationErrorToast({
        error,
        fallbackMessage: t('catalog.toasts.saveError'),
        statusMessages: {
          409: t('catalog.toasts.saveConflict'),
          422: apiMessage ?? t('catalog.toasts.invalidCatalog'),
        },
      });
    },
  });
};
