import { documentAssignmentsCollection } from '@/features/project/fvp/main-screen/data/collections/documentAssignments.collection';
import { useRequiredDocumentTypes } from '@/features/project/fvp/main-screen/data/read-model/useRequiredDocuments';
import { requestItemsCollection } from '@/features/project/nachforderungen/data/collections/requestItems.collection';
import { getRequestItemSourceRef } from '@/features/project/nachforderungen/data/schemas/requestItem.schema';
import { eq, useLiveQuery } from '@tanstack/react-db';

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
  } = useLiveQuery((q) =>
    q
      .from({ rows: documentAssignmentsCollection })
      .where(({ rows }) => eq(rows.projectId, projectId)),
  );

  const {
    data: requestItems,
    isLoading: requestItemsLoading,
    isError: requestItemsError,
  } = useLiveQuery((q) =>
    q
      .from({ items: requestItemsCollection })
      .where(({ items }) => eq(items.projectId, projectId)),
  );

  const assignedTypeIds = new Set(
    assignments
      .map((row) => row.documentTypeId)
      .filter((id): id is string => id !== null),
  );

  const requestedTypeIds = new Set(
    requestItems
      .map((item) => {
        const ref = getRequestItemSourceRef(item);
        if (!ref || ref.type !== 'requiredDocuments') {
          return null;
        }
        return ref.itemId ?? null;
      })
      .filter((id): id is string => id !== null),
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
