import { useFormalDocumentSummary } from '../data/read-model/useDocuments';
import { useRequiredDocumentTypes } from '@/features/project/fvp/main-screen/data/read-model/useRequiredDocuments';
import { useRequestSources } from '@/features/project/nachforderungen/data/requestQueries';

export type RequiredDocumentHintStatus =
  | 'open'
  | 'irrelevant'
  | 'requested'
  | 'available';

export type RequiredDocumentHint = {
  id: string;
  name: string;
  status: RequiredDocumentHintStatus;
};

/**
 * Builds sorted required-document hints by combining required types with document assignments and supplementary request items.
 *
 * @param projectId Project whose required-document hints should be derived.
 * @returns Required-document hints, aggregate counts, and loading state.
 */
export const useRequiredDocumentHints = (projectId: string) => {
  const {
    documentTypes,
    isLoading: typesLoading,
    isError: typesError,
  } = useRequiredDocumentTypes(projectId);

  const {
    data: assignments,
    isLoading: assignmentsLoading,
    isError: assignmentsError,
  } = useFormalDocumentSummary(projectId);

  const {
    data: sources = [],
    isLoading: requestItemsLoading,
    isError: requestItemsError,
  } = useRequestSources(projectId);

  const assignedTypeIds = new Set(assignments?.assignedTypeIds);

  const requestedTypeIds = new Set(
    sources.flatMap((ref) =>
      ref.type === 'requiredDocuments' ? [ref.itemId] : [],
    ),
  );

  const hints: RequiredDocumentHint[] = documentTypes.map((type) => {
    let status: RequiredDocumentHintStatus = 'open';
    if (type.isResolved) {
      status = 'irrelevant';
    } else if (assignedTypeIds.has(type.id)) {
      status = 'available';
    } else if (requestedTypeIds.has(type.id)) {
      status = 'requested';
    }
    return { id: type.id, name: type.name, status };
  });

  hints.sort((a, b) => {
    return a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });

  const totalRequired = hints.length;
  const processedCount = hints.filter((h) => h.status !== 'open').length;
  const openCount = totalRequired - processedCount;

  return {
    hints,
    totalRequired,
    processedCount,
    openCount,
    isLoading: typesLoading || assignmentsLoading || requestItemsLoading,
    isError: typesError || assignmentsError || requestItemsError,
  };
};
