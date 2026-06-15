import { buildDocumentsTree } from '@/features/project/data/document-tree/buildDocumentsTree';
import { useDocuments } from './useDocuments';
import { useRequiredDocumentTypes } from './useRequiredDocuments';

/**
 * Builds the hierarchical documents tree from API-backed collections.
 * Merges DMS files with FCS results and required document types.
 */
export const useDocumentsTree = (projectId: string) => {
  const {
    documents: files,
    isLoading: filesLoading,
    isError: filesError,
  } = useDocuments(projectId);
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
  };
};
