import type { NodePayloadByType } from '@/db/nodes/types';

export type FundstellenCardEntry = {
  id: string;
  pageNumber: number;
  title: string;
};

export type FundstellenDedupeKeyById = ReadonlyMap<string, string>;
export type ChunkIdsByFundstelleId = ReadonlyMap<string, string[]>;
export type OutdatedFundstelleIds = ReadonlySet<string>;

export type FundstellenNormGroupCardModel = {
  normId: string;
  hasOutdatedFundstellen?: boolean;
  entries: FundstellenCardEntry[];
};

export type FundstellenDocumentGroupCardModel = {
  documentId: string;
  hasOutdatedFundstellen?: boolean;
  entries: FundstellenCardEntry[];
};

export const EMPTY_FUNDSTELLEN_GROUPS = new Map<
  string,
  NodePayloadByType<'fundstelle'>[]
>();
const EMPTY_FUNDSTELLEN_DEDUPE_KEYS: FundstellenDedupeKeyById = new Map();
const EMPTY_OUTDATED_FUNDSTELLE_IDS: OutdatedFundstelleIds = new Set();

const getSmallestPageNumber = (pageNumbers: number[]) => {
  const positivePageNumbers = pageNumbers.filter(
    (pageNumber) => pageNumber > 0,
  );

  if (positivePageNumbers.length === 0) {
    return 1;
  }

  return Math.min(...positivePageNumbers);
};

export const createFundstellenByDocumentId = (
  fundstellen: NodePayloadByType<'fundstelle'>[],
) => {
  const fundstellenByDocumentId = new Map<
    string,
    NodePayloadByType<'fundstelle'>[]
  >();

  for (const fundstelle of fundstellen) {
    const existingEntries = fundstellenByDocumentId.get(fundstelle.dokument_id);

    if (existingEntries) {
      existingEntries.push(fundstelle);
      continue;
    }

    fundstellenByDocumentId.set(fundstelle.dokument_id, [fundstelle]);
  }

  return fundstellenByDocumentId;
};

export const createFundstellenByNormId = (
  fundstellen: NodePayloadByType<'fundstelle'>[],
) => {
  const fundstellenByNormId = new Map<
    string,
    NodePayloadByType<'fundstelle'>[]
  >();

  for (const fundstelle of fundstellen) {
    const existingEntries = fundstellenByNormId.get(fundstelle.norm_id);

    if (existingEntries) {
      existingEntries.push(fundstelle);
      continue;
    }

    fundstellenByNormId.set(fundstelle.norm_id, [fundstelle]);
  }

  return fundstellenByNormId;
};

export const createFundstellenCardEntries = (
  fundstellen: NodePayloadByType<'fundstelle'>[],
  dedupeKeyByFundstelleId: FundstellenDedupeKeyById = EMPTY_FUNDSTELLEN_DEDUPE_KEYS,
) => {
  const sortedFundstellen = fundstellen
    .map((fundstelle) => ({
      dedupeKey: dedupeKeyByFundstelleId.get(fundstelle.id),
      id: fundstelle.id,
      pageNumber: getSmallestPageNumber(fundstelle.page_numbers),
      title: fundstelle.title,
    }))
    .sort((left, right) => {
      if (left.pageNumber !== right.pageNumber) {
        return left.pageNumber - right.pageNumber;
      }

      return left.id.localeCompare(right.id, 'de');
    });
  const seenDedupeKeys = new Set<string>();

  return sortedFundstellen
    .filter((fundstelle) => {
      if (!fundstelle.dedupeKey) {
        return true;
      }

      if (seenDedupeKeys.has(fundstelle.dedupeKey)) {
        return false;
      }

      seenDedupeKeys.add(fundstelle.dedupeKey);
      return true;
    })
    .map((entry) => {
      const { dedupeKey: _dedupeKey, ...fundstelle } = entry;

      return fundstelle;
    });
};

export const createFundstellenDedupeKeyById = (
  fundstellen: NodePayloadByType<'fundstelle'>[],
  chunkIdsByFundstelleId: ChunkIdsByFundstelleId = new Map(
    fundstellen.map((fundstelle) => [fundstelle.id, fundstelle.chunk_ids]),
  ),
) => {
  return new Map(
    fundstellen.flatMap((fundstelle) => {
      const chunkIds = chunkIdsByFundstelleId.get(fundstelle.id) ?? [];

      if (chunkIds.length > 0) {
        return [
          [
            fundstelle.id,
            JSON.stringify([
              'chunks',
              fundstelle.dokument_id,
              [...chunkIds].sort((left, right) =>
                left.localeCompare(right, 'de'),
              ),
              fundstelle.title,
            ]),
          ],
        ];
      }

      return [];
    }),
  );
};

export const createFundstellenNormGroupCardModels = (
  fundstellenByNormId: Map<string, NodePayloadByType<'fundstelle'>[]>,
  dedupeKeyByFundstelleId: FundstellenDedupeKeyById = EMPTY_FUNDSTELLEN_DEDUPE_KEYS,
  outdatedFundstelleIds: OutdatedFundstelleIds = EMPTY_OUTDATED_FUNDSTELLE_IDS,
) => {
  return Array.from(fundstellenByNormId.entries())
    .map((entry) => {
      const [normId, groupedFundstellen] = entry;

      return {
        normId,
        ...(groupedFundstellen.some((fundstelle) =>
          outdatedFundstelleIds.has(fundstelle.id),
        )
          ? { hasOutdatedFundstellen: true }
          : {}),
        entries: createFundstellenCardEntries(
          groupedFundstellen,
          dedupeKeyByFundstelleId,
        ),
      } satisfies FundstellenNormGroupCardModel;
    })
    .sort((left, right) => {
      const leftFirstPage =
        left.entries[0]?.pageNumber ?? Number.MAX_SAFE_INTEGER;
      const rightFirstPage =
        right.entries[0]?.pageNumber ?? Number.MAX_SAFE_INTEGER;

      if (leftFirstPage !== rightFirstPage) {
        return leftFirstPage - rightFirstPage;
      }

      return left.normId.localeCompare(right.normId, 'de');
    });
};

export const createFundstellenDocumentGroupCardModels = (
  fundstellenByDocumentId: Map<string, NodePayloadByType<'fundstelle'>[]>,
  dedupeKeyByFundstelleId: FundstellenDedupeKeyById = EMPTY_FUNDSTELLEN_DEDUPE_KEYS,
  outdatedFundstelleIds: OutdatedFundstelleIds = EMPTY_OUTDATED_FUNDSTELLE_IDS,
) => {
  return Array.from(fundstellenByDocumentId.entries())
    .map((entry) => {
      const [documentId, groupedFundstellen] = entry;

      return {
        documentId,
        ...(groupedFundstellen.some((fundstelle) =>
          outdatedFundstelleIds.has(fundstelle.id),
        )
          ? { hasOutdatedFundstellen: true }
          : {}),
        entries: createFundstellenCardEntries(
          groupedFundstellen,
          dedupeKeyByFundstelleId,
        ),
      } satisfies FundstellenDocumentGroupCardModel;
    })
    .sort((left, right) => {
      const leftFirstPage =
        left.entries[0]?.pageNumber ?? Number.MAX_SAFE_INTEGER;
      const rightFirstPage =
        right.entries[0]?.pageNumber ?? Number.MAX_SAFE_INTEGER;

      if (leftFirstPage !== rightFirstPage) {
        return leftFirstPage - rightFirstPage;
      }

      return left.documentId.localeCompare(right.documentId, 'de');
    });
};
