import { type ZipFileResponse } from '@/api-clients/dms-module';
import { useProjectRouteVersion } from '@/features/project/versioning/projectVersioning';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { loadProjectProcessingFiles } from './loadProjectProcessingFiles';
import {
  filterProcessingFilesByType,
  PROJECT_DOCUMENT_PROCESSING_FILE_TYPES,
  type ProcessingFileType,
} from './processingFileTypes';
import {
  isActiveWorkflowStatus,
  isActiveZipApprovalStatus,
} from './processingFileStatuses';

const POLL_INTERVAL_MS = 3000;

type UseProcessingFilesQueryOptions = {
  projectId: string | null;
  enabled?: boolean;
  fileTypes?: ReadonlyArray<ProcessingFileType>;
  // When true, polls every 3s while any file is in an active workflow status.
  pollWhileActive?: boolean;
  // When set, polls every 3s while the targeted zip is missing or active.
  // Used by the upload completion polling path to wait for a specific row.
  pollUntilZipFileId?: string | null;
};

/**
 * Computes the next refetch interval for the processing-files query based on
 * the current cached snapshot and the polling mode requested by the caller.
 *
 * @param files Cached zip file list from the previous response.
 * @param pollWhileActive Whether to poll while any file is in an active workflow status.
 * @param pollUntilZipFileId Specific zip id to wait for; the hook polls while it is missing or active.
 * @returns Milliseconds until the next refetch, or `false` to stop polling.
 */
const resolveRefetchInterval = (
  files: ReadonlyArray<
    Pick<ZipFileResponse, 'approvalStatus' | 'id' | 'type' | 'workflowStatus'>
  >,
  fileTypes: ReadonlyArray<ProcessingFileType>,
  pollWhileActive: boolean,
  pollUntilZipFileId: string | null,
): number | false => {
  const scopedFiles = filterProcessingFilesByType(files, fileTypes);

  if (pollUntilZipFileId !== null) {
    const targetFile = scopedFiles.find(
      (file) => file.id === pollUntilZipFileId,
    );
    if (!targetFile) {
      return POLL_INTERVAL_MS;
    }
    return isActiveWorkflowStatus(targetFile.workflowStatus) ||
      isActiveZipApprovalStatus(targetFile.approvalStatus)
      ? POLL_INTERVAL_MS
      : false;
  }
  if (pollWhileActive) {
    if (scopedFiles.length === 0) {
      return false;
    }
    return scopedFiles.some(
      (file) =>
        isActiveWorkflowStatus(file.workflowStatus) ||
        isActiveZipApprovalStatus(file.approvalStatus),
    )
      ? POLL_INTERVAL_MS
      : false;
  }
  return false;
};

/**
 * Centralizes the `['processing-files', projectId, projectVersion]` TanStack
 * Query so the documents table, version badge, and upload completion polling
 * share one cached fetch and one refetch cadence.
 *
 * @param options Project id, enablement flags, and the polling mode.
 * @returns The TanStack Query result for the project's ZIP files.
 */
export const useProcessingFilesQuery = (
  options: UseProcessingFilesQueryOptions,
): UseQueryResult<Awaited<ReturnType<typeof loadProjectProcessingFiles>>> => {
  const {
    projectId,
    enabled = true,
    fileTypes = PROJECT_DOCUMENT_PROCESSING_FILE_TYPES,
    pollWhileActive = false,
    pollUntilZipFileId = null,
  } = options;
  const routeProjectVersion = useProjectRouteVersion();
  const shouldLoad = enabled && projectId !== null && projectId.length > 0;
  const projectVersion = shouldLoad ? routeProjectVersion : undefined;

  return useQuery({
    queryKey: ['processing-files', projectId, projectVersion],
    queryFn: () => {
      if (projectId === null || projectVersion === undefined) {
        return Promise.resolve([]);
      }
      return loadProjectProcessingFiles(projectId, projectVersion);
    },
    enabled: shouldLoad,
    refetchInterval: (query) =>
      resolveRefetchInterval(
        query.state.data ?? [],
        fileTypes,
        pollWhileActive,
        pollUntilZipFileId,
      ),
    select: (files) => filterProcessingFilesByType(files, fileTypes),
  });
};
