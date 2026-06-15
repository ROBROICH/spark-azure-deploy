import { useQuery } from '@tanstack/react-query';
import { eq, useLiveQuery } from '@tanstack/react-db';

import { requestItemsCollection } from '@/features/project/nachforderungen/data/collections/requestItems.collection';
import {
  getRequestItemSourceItemId,
  getRequestItemSourceType,
} from '@/features/project/nachforderungen/data/schemas/requestItem.schema';
import {
  getTocNotesResponseQueryOptions,
  tocNotesCollection,
} from '../collections/tocNotes.collection';

export type TableOfContentsItem = {
  id: string;
  name: string;
  isOnRequestList: boolean;
  isResolved: boolean;
};

export const useTableOfContentsDocuments = (projectId: string) => {
  const { data: tocNotesResponse, isError: tocStatusError } = useQuery(
    getTocNotesResponseQueryOptions(projectId),
  );
  const {
    data: tocNotes,
    isLoading: tocLoading,
    isError: tocError,
  } = useLiveQuery((q) =>
    q
      .from({ notes: tocNotesCollection })
      .where(({ notes }) => eq(notes.projectId, projectId)),
  );

  const {
    data: requestItems,
    isLoading: requestsLoading,
    isError: requestsError,
  } = useLiveQuery((q) =>
    q
      .from({ items: requestItemsCollection })
      .where(({ items }) => eq(items.projectId, projectId)),
  );
  const requestedIds = new Set(
    requestItems
      .filter((item) => {
        const sourceType = getRequestItemSourceType(item);
        return (
          sourceType === 'tableOfContents' || sourceType === 'requiredDocuments'
        );
      })
      .map((item) => getRequestItemSourceItemId(item))
      .filter((id): id is string => id !== undefined),
  );

  const items: TableOfContentsItem[] = tocNotes.map((note) => ({
    id: note.id,
    name: note.content,
    isOnRequestList: requestedIds.has(note.id),
    isResolved: note.isResolved,
  }));

  const unresolvedCount = items.filter((item) => !item.isResolved).length;
  const totalItems = items.length;

  return {
    items,
    status: tocNotesResponse?.status ?? null,
    unresolvedCount,
    totalItems,
    isLoading: tocLoading || requestsLoading,
    isError: tocError || tocStatusError || requestsError,
  };
};
