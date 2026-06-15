import { measureGraphPerf } from '@/db/nodes/graphPerf';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useLiveNodes } from '@/db/nodes/hooks/useLiveNodes';
import type { NodePayloadByType } from '@/db/nodes/types';
import { isNodeSummaryOutdated } from '@/features/project/versioning/outdatedSummary';
import {
  createFundstellenByDocumentId,
  createFundstellenByNormId,
  createFundstellenCardEntries,
  createFundstellenDocumentGroupCardModels,
  createFundstellenNormGroupCardModels,
  EMPTY_FUNDSTELLEN_GROUPS,
} from './mvpFundstellenCardModels';
import { useFundstellenDedupeKeys } from './useFundstellenDedupeKeys';

type FundstellenSelectionParams = {
  selectedDocumentId?: string;
  selectedNormId?: string;
};

type DocumentFundstellenSelectionResult = {
  mode: 'document';
  isLoading: boolean;
  fundstellen: NodePayloadByType<'fundstelle'>[];
  fundstellenCards: ReturnType<typeof createFundstellenNormGroupCardModels>;
};

type NormFundstellenSelectionResult = {
  mode: 'norm';
  isLoading: boolean;
  fundstellen: NodePayloadByType<'fundstelle'>[];
  fundstellenCards: ReturnType<typeof createFundstellenDocumentGroupCardModels>;
};

type DocumentNormFundstellenSelectionResult = {
  mode: 'documentAndNorm';
  isLoading: boolean;
  entries: ReturnType<typeof createFundstellenCardEntries>;
  fundstellen: NodePayloadByType<'fundstelle'>[];
};

const useFundstelleIdSet = (fundstellenRefs: ReadonlyArray<{ id: string }>) => {
  return new Set(fundstellenRefs.map((fundstelleRef) => fundstelleRef.id));
};

const useSelectionFundstelleRefs = (params: FundstellenSelectionParams) => {
  const documentRef = params.selectedDocumentId
    ? { id: params.selectedDocumentId, node_type: 'dokument' as const }
    : null;
  const normRef = params.selectedNormId
    ? { id: params.selectedNormId, node_type: 'norm' as const }
    : null;
  const documentFundstellenRefs = useDescendants('fundstelle', documentRef);
  const normFundstellenRefs = useDescendants('fundstelle', normRef);
  const normFundstelleIds = useFundstelleIdSet(normFundstellenRefs);

  if (params.selectedDocumentId && params.selectedNormId) {
    return documentFundstellenRefs.filter((fundstelleRef) =>
      normFundstelleIds.has(fundstelleRef.id),
    );
  }

  if (params.selectedDocumentId) {
    return documentFundstellenRefs;
  }

  if (params.selectedNormId) {
    return normFundstellenRefs;
  }

  return [];
};

const useSelectionFundstellen = (params: FundstellenSelectionParams) => {
  const fundstellenRefs = useSelectionFundstelleRefs(params);
  const { data: fundstellen, isLoading } = useLiveNodes(fundstellenRefs);
  const outdatedFundstelleIds = new Set(
    fundstellenRefs.flatMap((fundstelleRef) =>
      isNodeSummaryOutdated(fundstelleRef) ? [fundstelleRef.id] : [],
    ),
  );

  return {
    fundstellen,
    outdatedFundstelleIds,
    isLoading:
      fundstellenRefs.length > 0 && fundstellen.length === 0 && isLoading,
  };
};

const useDocumentFundstellenCards = (
  fundstellen: NodePayloadByType<'fundstelle'>[],
  outdatedFundstelleIds: ReadonlySet<string>,
  documentId?: string,
) => {
  const { dedupeKeyByFundstelleId } = useFundstellenDedupeKeys(fundstellen);
  const fundstellenByNormId = documentId
    ? createFundstellenByNormId(fundstellen)
    : EMPTY_FUNDSTELLEN_GROUPS;

  return measureGraphPerf(
    'mvp.fundstellen.cardsForDocument.resolve',
    () =>
      createFundstellenNormGroupCardModels(
        fundstellenByNormId,
        dedupeKeyByFundstelleId,
        outdatedFundstelleIds,
      ),
    {
      documentId,
      groupCount: fundstellenByNormId.size,
    },
  );
};

const useNormFundstellenCards = (
  fundstellen: NodePayloadByType<'fundstelle'>[],
  outdatedFundstelleIds: ReadonlySet<string>,
  normId?: string,
) => {
  const { dedupeKeyByFundstelleId } = useFundstellenDedupeKeys(fundstellen);
  const fundstellenByDocumentId = normId
    ? createFundstellenByDocumentId(fundstellen)
    : EMPTY_FUNDSTELLEN_GROUPS;

  return measureGraphPerf(
    'mvp.fundstellen.cardsForNorm.resolve',
    () =>
      createFundstellenDocumentGroupCardModels(
        fundstellenByDocumentId,
        dedupeKeyByFundstelleId,
        outdatedFundstelleIds,
      ),
    {
      groupCount: fundstellenByDocumentId.size,
      normId,
    },
  );
};

const useSelectedFundstellenEntries = (
  fundstellen: NodePayloadByType<'fundstelle'>[],
  params: FundstellenSelectionParams,
) => {
  const { dedupeKeyByFundstelleId } = useFundstellenDedupeKeys(fundstellen);

  return measureGraphPerf(
    'mvp.fundstellen.entriesForDocumentAndNorm.resolve',
    () => createFundstellenCardEntries(fundstellen, dedupeKeyByFundstelleId),
    {
      documentId: params.selectedDocumentId,
      fundstellenCount: fundstellen.length,
      normId: params.selectedNormId,
    },
  );
};

export const useFundstellenDocumentResult = (
  selectedDocumentId: string,
): DocumentFundstellenSelectionResult => {
  const { fundstellen, isLoading, outdatedFundstelleIds } =
    useSelectionFundstellen({ selectedDocumentId });
  const fundstellenCards = useDocumentFundstellenCards(
    fundstellen,
    outdatedFundstelleIds,
    selectedDocumentId,
  );

  return {
    fundstellen,
    fundstellenCards,
    isLoading,
    mode: 'document',
  };
};

export const useFundstellenNormResult = (
  selectedNormId: string,
): NormFundstellenSelectionResult => {
  const { fundstellen, isLoading, outdatedFundstelleIds } =
    useSelectionFundstellen({ selectedNormId });
  const fundstellenCards = useNormFundstellenCards(
    fundstellen,
    outdatedFundstelleIds,
    selectedNormId,
  );

  return {
    fundstellen,
    fundstellenCards,
    isLoading,
    mode: 'norm',
  };
};

export const useFundstellenDocumentNormResult = (
  params: Required<FundstellenSelectionParams>,
): DocumentNormFundstellenSelectionResult => {
  const { fundstellen, isLoading } = useSelectionFundstellen(params);
  const entries = useSelectedFundstellenEntries(fundstellen, params);

  return {
    entries,
    fundstellen,
    isLoading,
    mode: 'documentAndNorm',
  };
};
