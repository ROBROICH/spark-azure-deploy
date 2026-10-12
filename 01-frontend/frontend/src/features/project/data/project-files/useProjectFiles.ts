import { skipToken, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import {
  v1DocumentManagementGetFile,
  v1DocumentManagementListFiles,
} from '@/api-clients/backend';
import { useProjectRouteVersion } from '@/features/project/versioning/projectVersioning';

const FILES_PAGE_SIZE = 50;

/**
 * Document-version selection and filename filtering stay part of the paging identity.
 * @param projectId - Authorized project whose documents are displayed.
 * @param options - Optional explicit document version, admission flag, and server-side search.
 * @returns Only loaded document pages and their continuation/error state.
 */
export const useProjectFiles = (
  projectId: string,
  options: { documentVersion?: number; enabled?: boolean; name?: string } = {},
) => {
  const routeProjectVersion = useProjectRouteVersion();
  const projectVersion = options.documentVersion ?? routeProjectVersion;
  const shouldLoad = (options.enabled ?? true) && projectId.length > 0;
  const name = options.name?.trim() || undefined;
  const query = useInfiniteQuery({
    queryKey: ['files', projectId, projectVersion, { name }],
    queryFn: shouldLoad
      ? async ({ pageParam }) => {
          const { data } = await v1DocumentManagementListFiles({
            query: {
              fileType: 'document',
              projectId,
              projectVersion,
              name,
              page: pageParam,
              pageSize: FILES_PAGE_SIZE,
            },
            throwOnError: true,
          });
          return data;
        }
      : skipToken,
    initialPageParam: 1,
    getNextPageParam: (lastPage, _pages, page) =>
      lastPage.length === FILES_PAGE_SIZE ? page + 1 : undefined,
    select: (data) => data.pages.flat(),
  });

  return {
    files: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    hasNextPage: query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
  };
};

type UseProjectFileParams = {
  documentVersion?: number;
  projectId: string;
  fileId: string | null | undefined;
};

/**
 * Resolves off-page selections without loading unrelated files or crossing project scope.
 * @param props - Selected file, owning project, and optional document version.
 * @returns The exact authorized file or the native pending/error state.
 */
export const useProjectFile = (props: UseProjectFileParams) => {
  const { documentVersion, projectId, fileId } = props;
  const routeProjectVersion = useProjectRouteVersion();
  const projectVersion = documentVersion ?? routeProjectVersion;
  const { data, isLoading, isError } = useQuery({
    queryKey: ['files', projectId, projectVersion, 'detail', fileId],
    queryFn:
      fileId && projectId
        ? async () => {
            const { data: file } = await v1DocumentManagementGetFile({
              path: { fileId },
              query: { projectVersion },
              throwOnError: true,
            });
            if (file.projectId !== projectId) {
              throw new Error(
                'The selected document does not belong to this project.',
              );
            }
            return file;
          }
        : skipToken,
  });

  return { file: data ?? null, isLoading, isError };
};
