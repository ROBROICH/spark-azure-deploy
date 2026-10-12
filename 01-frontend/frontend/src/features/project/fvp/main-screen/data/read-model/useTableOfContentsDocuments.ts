import { useQuery } from '@tanstack/react-query';
import { eq, useLiveQuery } from '@tanstack/react-db';

import { useRequestSources } from '@/features/project/nachforderungen/data/requestQueries';
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
    data: requestSources = [],
    isLoading: requestsLoading,
    isError: requestsError,
  } = useRequestSources(projectId);
  const requestedIds = new Set(
    requestSources.flatMap((ref) =>
      ref.type === 'tableOfContents' || ref.type === 'requiredDocuments'
        ? [ref.itemId]
        : [],
    ),
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
