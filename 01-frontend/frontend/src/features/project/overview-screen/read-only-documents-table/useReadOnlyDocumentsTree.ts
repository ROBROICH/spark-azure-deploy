import { useProjectFiles } from '@/features/project/data/project-files/useProjectFiles';
import { buildDocumentsTree } from '@/features/project/data/document-tree/buildDocumentsTree';
import { useMemo } from 'react';

type UseReadOnlyDocumentsTreeOptions = {
  documentVersion?: number;
  name?: string;
};

export const useReadOnlyDocumentsTree = (
  projectId: string,
  options: UseReadOnlyDocumentsTreeOptions = {},
) => {
  const {
    files,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useProjectFiles(projectId, {
    documentVersion: options.documentVersion,
    enabled: projectId.length > 0,
    name: options.name,
  });

  // eslint-disable-next-line no-restricted-syntax -- treeData is the source of useEffect dependencies in ReadOnlyDocumentsTable (auto-expand). Without memo, the per-render mapper + buildDocumentsTree allocations produce a fresh array each render, causing setExpanded to fire every render and risking React's max-update-depth crash.
  const treeData = useMemo(
    () =>
      buildDocumentsTree(
        files.map((file) => ({
          id: file.id,
          path: file.filename,
          createdAt: file.createdAt,
          linkedDocumentTypeId: null,
          linkedDocumentTypeHumanApproved: false,
          isDeleted: false,
          topics: [],
        })),
        [],
      ),
    [files],
  );

  return {
    treeData,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    sourceDocumentsCount: files.length,
  };
};
