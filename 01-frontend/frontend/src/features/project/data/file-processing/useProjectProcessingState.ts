import {
  type WorkflowStatusEnum,
  type ZipFileResponse,
} from '@/api-clients/dms-module';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useProcessingFilesQuery } from './useProcessingFilesQuery';
import {
  ACTIVE_WORKFLOW_STATUSES,
  FAILED_WORKFLOW_STATUSES,
  isActiveZipApprovalStatus,
} from './processingFileStatuses';
import type { ProcessingFileType } from './processingFileTypes';

const getUpdatedAtTime = (file: ZipFileResponse) => {
  const parsedTime = Date.parse(file.updatedAt);
  return Number.isNaN(parsedTime) ? 0 : parsedTime;
};

const getMostRecentProcessingFile = (
  files: ZipFileResponse[],
  statuses: ReadonlySet<WorkflowStatusEnum>,
): ZipFileResponse | undefined =>
  files
    .filter((file) => statuses.has(file.workflowStatus))
    .sort((left, right) => {
      const timeDifference = getUpdatedAtTime(right) - getUpdatedAtTime(left);
      if (timeDifference !== 0) {
        return timeDifference;
      }

      return right.id.localeCompare(left.id);
    })[0];

const buildFileProcessingDismissKey = (file: ZipFileResponse) =>
  `${file.id}:${file.updatedAt}:${file.workflowStatus}`;

type UseProjectProcessingStateArgs = {
  fileTypes?: ReadonlyArray<ProcessingFileType>;
  projectId: string;
};

/**
 * Polls the project's ZIP file workflows so consumers can render the file
 * processing banner and invalidate document caches when active processing
 * settles. By default this scopes to regular project document ZIPs and ignores
 * EWMS ZIP uploads.
 *
 * @param args.fileTypes Optional upload types that should count as processing state.
 * @param args.projectId Project whose processing state should be tracked.
 * @returns Loading flag, banner status flags, and the dismiss key for the banner.
 */
export const useProjectProcessingState = (
  args: UseProjectProcessingStateArgs,
) => {
  const { fileTypes, projectId } = args;
  const queryClient = useQueryClient();

  const { data: processingFiles = [], isLoading: isLoadingProcessingState } =
    useProcessingFilesQuery({
      fileTypes,
      projectId,
      pollWhileActive: true,
    });

  const hasActiveFileProcessing = processingFiles.some(
    (file) =>
      ACTIVE_WORKFLOW_STATUSES.has(file.workflowStatus) ||
      isActiveZipApprovalStatus(file.approvalStatus),
  );
  const firstFailedProcessingFile = getMostRecentProcessingFile(
    processingFiles,
    FAILED_WORKFLOW_STATUSES,
  );
  const hasFailedFileProcessing =
    !hasActiveFileProcessing && firstFailedProcessingFile !== undefined;
  const fileProcessingBannerDismissKey = hasFailedFileProcessing
    ? buildFileProcessingDismissKey(firstFailedProcessingFile)
    : null;

  const previousHasActiveRef = useRef(hasActiveFileProcessing);
  // Bridge polling-derived state into the query cache. TanStack Query v5
  // removed `useQuery` success/settle callbacks, and there is no upload event
  // observable from this consumer; the only observation that "active
  // processing finished" is the polled snapshot transitioning from active to
  // settled. Edge-detect via ref so the invalidation runs once per transition.
  // eslint-disable-next-line no-restricted-syntax -- no query-layer hook exists for this transition in TanStack Query v5; see comment above.
  useEffect(() => {
    if (previousHasActiveRef.current && !hasActiveFileProcessing) {
      queryClient.invalidateQueries({ queryKey: ['files', projectId] });
    }
    previousHasActiveRef.current = hasActiveFileProcessing;
  }, [hasActiveFileProcessing, queryClient, projectId]);

  return {
    isLoadingProcessingState,
    hasActiveFileProcessing,
    hasFailedFileProcessing,
    fileProcessingBannerDismissKey,
  };
};
