import { queryOptions } from '@tanstack/react-query';

import { getCatalogUsecase, type Usecase } from '../data/usecaseApi';
import { isCatalogNotFoundError } from './catalogApiError';
import { readUsecaseResponse } from './usecaseResponse';

export const catalogUsecaseQueryKey = (usecaseId: string) =>
  ['catalog-usecase', usecaseId] as const;

export type CatalogUsecaseQueryResult =
  | { kind: 'ready'; usecase: Usecase }
  | { kind: 'missing' };

/**
 * Loads one catalog usecase for the selected project type. HTTP 404 is a
 * successful "no catalog yet" result so the init card can render without the
 * query error UI.
 *
 * @param usecaseId Project type id, which is the catalog usecase id.
 * @returns Ready usecase or the missing-catalog sentinel.
 */
export const loadCatalogUsecase = async (
  usecaseId: string,
): Promise<CatalogUsecaseQueryResult> => {
  try {
    const result = await getCatalogUsecase(usecaseId);
    return { kind: 'ready', usecase: readUsecaseResponse(result) };
  } catch (error) {
    if (isCatalogNotFoundError(error)) {
      return { kind: 'missing' };
    }

    throw error;
  }
};

export const catalogUsecaseQueryOptions = (usecaseId: string) =>
  queryOptions({
    queryKey: catalogUsecaseQueryKey(usecaseId),
    queryFn: () => loadCatalogUsecase(usecaseId),
    enabled: usecaseId.length > 0,
    meta: {
      area: 'administration',
      operation: 'load-catalog-usecase',
    },
  });
