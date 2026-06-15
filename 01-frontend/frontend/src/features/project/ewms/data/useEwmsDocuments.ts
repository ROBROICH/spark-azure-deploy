import { useProjectRouteVersion } from '@/features/project/versioning/projectVersioning';
import { useIsFetching, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadEwmsDocuments } from './ewmsDocuments.collection';

/** Uses the query cache to keep document metadata stable during background refetches. */
export const useEwmsDocuments = (
  projectId: string,
  options: { enabled?: boolean } = {},
) => {
  const enabled = projectId.length > 0 && (options.enabled ?? true);
  const projectVersion = useProjectRouteVersion();
  const queryClient = useQueryClient();
  const ewmsDocumentsQueryKey = [
    'ewms-documents',
    projectId,
    projectVersion,
  ] as const;
  const fetchingDocumentsCount = useIsFetching({
    queryKey: ewmsDocumentsQueryKey,
  });

  const {
    data: queriedDocumentItems,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ewmsDocumentsQueryKey,
    queryFn: () => {
      if (!enabled) {
        return Promise.resolve([]);
      }
      return loadEwmsDocuments(projectId, projectVersion);
    },
    enabled,
  });
  const documentItems = queriedDocumentItems ?? [];

  const queryState = queryClient.getQueryState(ewmsDocumentsQueryKey);
  const hasCheckedCurrentProjectDocuments = Boolean(
    queryState &&
    (queryState.dataUpdatedAt > 0 || queryState.status === 'error'),
  );

  const documents = documentItems.map((document) => document.file);

  return {
    documents,
    documentItems,
    isLoading:
      enabled &&
      !hasCheckedCurrentProjectDocuments &&
      (isLoading || fetchingDocumentsCount > 0) &&
      documentItems.length === 0,
    isLoadingMore: false,
    isError,
  };
};
