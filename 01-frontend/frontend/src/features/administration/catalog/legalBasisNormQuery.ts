import {
  v1ExaminationGetLegalBasisNorms as getLegalBasisNorms,
  type V1ExaminationGetLegalBasisNormsResponse as GetLegalBasisNormsResponse,
} from '@/api-clients/backend';
import type { FederalStateCode } from '@/features/project/data/project-details-form/federalStates';
import { queryOptions } from '@tanstack/react-query';

export type LegalBasisNormItem = GetLegalBasisNormsResponse[number];

export const LEGAL_BASIS_NORMS_PAGE_SIZE = 6_000;

export const unwrapLegalBasisNormPage = (
  result: unknown,
): LegalBasisNormItem[] => {
  if (Array.isArray(result)) {
    return result as LegalBasisNormItem[];
  }
  if (
    typeof result === 'object' &&
    result !== null &&
    'data' in result &&
    Array.isArray(result.data)
  ) {
    return result.data as LegalBasisNormItem[];
  }
  return [];
};

export const filterFederalLegalBasisNorms = (
  items: ReadonlyArray<LegalBasisNormItem>,
): LegalBasisNormItem[] => items.filter((item) => item.bundesland === null);

export const filterStateLegalBasisNorms = (
  items: ReadonlyArray<LegalBasisNormItem>,
  stateCode: FederalStateCode,
): LegalBasisNormItem[] =>
  items.filter((item) => item.bundesland === stateCode);

/**
 * Follows GET /legal-basis/norms pagination until a short page arrives.
 * Pages must stay sequential because each offset depends on the previous page.
 */
export const fetchAllLegalBasisNormPages = async (params: {
  bundesland?: FederalStateCode;
  jurabk?: string;
}): Promise<LegalBasisNormItem[]> => {
  /**
   * Fetches the next page after the prior page determines its offset.
   *
   * @param offset Offset of the page to request.
   * @returns This page followed by all remaining pages.
   */
  const fetchFromOffset = async (
    offset: number,
  ): Promise<LegalBasisNormItem[]> => {
    const result = await getLegalBasisNorms({
      query: {
        bundesland: params.bundesland,
        jurabk: params.jurabk,
        offset,
        limit: LEGAL_BASIS_NORMS_PAGE_SIZE,
      },
      throwOnError: true,
    });
    const page = unwrapLegalBasisNormPage(result);
    if (page.length < LEGAL_BASIS_NORMS_PAGE_SIZE) {
      return page;
    }

    return [...page, ...(await fetchFromOffset(offset + page.length))];
  };

  return fetchFromOffset(0);
};

export const federalLegalBasisNormsQueryOptions = (enabled: boolean) =>
  queryOptions({
    queryKey: ['administration', 'legal-basis-norms', 'federal'] as const,
    queryFn: async () =>
      filterFederalLegalBasisNorms(await fetchAllLegalBasisNormPages({})),
    enabled,
    meta: {
      area: 'administration',
      operation: 'load-federal-legal-basis-norms',
    },
  });

export const stateLegalBasisNormsQueryOptions = (
  stateCode: FederalStateCode,
  enabled: boolean,
) =>
  queryOptions({
    queryKey: [
      'administration',
      'legal-basis-norms',
      'state',
      stateCode,
    ] as const,
    queryFn: async () =>
      filterStateLegalBasisNorms(
        await fetchAllLegalBasisNormPages({ bundesland: stateCode }),
        stateCode,
      ),
    enabled,
    meta: {
      area: 'administration',
      operation: 'load-state-legal-basis-norms',
    },
  });

export const completeLawLegalBasisNormsQueryOptions = (params: {
  jurabk: string;
  bundesland?: FederalStateCode;
}) =>
  queryOptions({
    queryKey: [
      'administration',
      'legal-basis-norms',
      'law',
      params.jurabk,
      params.bundesland ?? 'federal',
    ] as const,
    queryFn: async () => {
      const items = await fetchAllLegalBasisNormPages(params);
      if (params.bundesland) {
        return filterStateLegalBasisNorms(items, params.bundesland);
      }
      return filterFederalLegalBasisNorms(items);
    },
    meta: {
      area: 'administration',
      operation: 'load-complete-legal-basis-law',
    },
  });
