import type { NodePayloadByType } from '@/db/nodes/types';
import { isNumber } from 'es-toolkit';

export type FundstellenCardEntry = {
  id: string;
  pageNumber: number;
  title: string;
  confidence?: number | null;
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
    const existingEntries = fundstellenByDocumentId.get(fundstelle.dokumentId);

    if (existingEntries) {
      existingEntries.push(fundstelle);
      continue;
    }

    fundstellenByDocumentId.set(fundstelle.dokumentId, [fundstelle]);
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
    const existingEntries = fundstellenByNormId.get(fundstelle.normId);

    if (existingEntries) {
      existingEntries.push(fundstelle);
      continue;
    }

    fundstellenByNormId.set(fundstelle.normId, [fundstelle]);
  }

  return fundstellenByNormId;
};

/**
 * Resolves the confidence a deduplicated group shows.
 *
 * The same passage is found once per Tatbestandsmerkmal, so duplicates carry
 * their own confidence. Deduplication keeps one finding by page and id, which
 * would make the shown level depend on a generated id rather than on the
 * signal. The group therefore reports its highest confidence.
 */
const createMaximumConfidenceByDedupeKey = (
  fundstellen: NodePayloadByType<'fundstelle'>[],
  dedupeKeyByFundstelleId: FundstellenDedupeKeyById,
) => {
  const maximumConfidenceByDedupeKey = new Map<string, number>();

  for (const fundstelle of fundstellen) {
    const dedupeKey = dedupeKeyByFundstelleId.get(fundstelle.id);
    const confidence = fundstelle.confidence;

    if (!dedupeKey || !isNumber(confidence)) {
      continue;
    }

    const current = maximumConfidenceByDedupeKey.get(dedupeKey);

    if (current === undefined || confidence > current) {
      maximumConfidenceByDedupeKey.set(dedupeKey, confidence);
    }
  }

  return maximumConfidenceByDedupeKey;
};

export const createFundstellenCardEntries = (
  fundstellen: NodePayloadByType<'fundstelle'>[],
  dedupeKeyByFundstelleId: FundstellenDedupeKeyById = EMPTY_FUNDSTELLEN_DEDUPE_KEYS,
) => {
  const maximumConfidenceByDedupeKey = createMaximumConfidenceByDedupeKey(
    fundstellen,
    dedupeKeyByFundstelleId,
  );
  const sortedFundstellen = fundstellen
    .map((fundstelle) => {
      const dedupeKey = dedupeKeyByFundstelleId.get(fundstelle.id);

      return {
        dedupeKey,
        id: fundstelle.id,
        pageNumber: getSmallestPageNumber(fundstelle.pageNumbers),
        title: fundstelle.title,
        confidence: dedupeKey
          ? (maximumConfidenceByDedupeKey.get(dedupeKey) ??
            fundstelle.confidence)
          : fundstelle.confidence,
      };
    })
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
      const { dedupeKey: _dedupeKey, confidence, ...fundstelle } = entry;

      if (isNumber(confidence)) {
        return { ...fundstelle, confidence };
      }

      return fundstelle;
    });
};

export const createFundstellenDedupeKeyById = (
  fundstellen: NodePayloadByType<'fundstelle'>[],
  chunkIdsByFundstelleId: ChunkIdsByFundstelleId = new Map(
    fundstellen.map((fundstelle) => [fundstelle.id, fundstelle.chunkIds]),
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
              fundstelle.dokumentId,
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
