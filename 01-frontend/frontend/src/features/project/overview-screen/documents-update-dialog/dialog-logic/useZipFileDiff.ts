import {
  v1DocumentManagementGetFileDiff as getFileDiff,
  type FileDiffResponse,
} from '@/api-clients/backend';
import { useQuery } from '@tanstack/react-query';

/**
 * Fetches the diff for a newly uploaded ZIP file after processing completes.
 *
 * @param zipFileId ID of the uploaded ZIP file whose diff should be fetched.
 * @returns The diff response and query state.
 */
export const useZipFileDiff = (zipFileId: string | null) => {
  const { data, isLoading, isError, refetch } =
    useQuery<FileDiffResponse | null>({
      queryKey: ['zip-file-diff', zipFileId],
      queryFn: async () => {
        if (!zipFileId) {
          return null;
        }
        const { data: diff } = await getFileDiff({
          path: { fileId: zipFileId },
        });
        return diff ?? null;
      },
      enabled: zipFileId !== null,
      // Bounded stale window so late server-side revisions to the diff are
      // eventually re-fetched while still avoiding refetch storms while the
      // dialog is open.
      staleTime: 30_000,
    });

  return { diff: data ?? null, isLoading, isError, refetch };
};
