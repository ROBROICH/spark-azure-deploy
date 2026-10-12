import { buildDocumentsTree } from '@/features/project/data/document-tree/buildDocumentsTree';
import { useDocuments, type DocumentListFilters } from './useDocuments';
import { useRequiredDocumentTypes } from './useRequiredDocuments';

export const useDocumentsTree = (
  projectId: string,
  filters: DocumentListFilters = {},
) => {
  const {
    documents: files,
    isLoading: filesLoading,
    isError: filesError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useDocuments(projectId, filters);
  const {
    documentTypes: requiredTypes,
    isLoading: typesLoading,
    isError: typesError,
  } = useRequiredDocumentTypes(projectId);

  const treeData = buildDocumentsTree(files, requiredTypes);

  return {
    treeData,
    isLoading: filesLoading || typesLoading,
    isError: filesError || typesError,
    sourceDocumentsCount: files.length,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  };
};
