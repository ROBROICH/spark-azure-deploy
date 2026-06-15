import {
  type WorkflowStatusEnum,
  type ZipApprovalStatus,
} from '@/api-clients/dms-module';
import { useProcessingFilesQuery } from '@/features/project/data/file-processing/useProcessingFilesQuery';
import { isFailedWorkflowStatus } from '@/features/project/data/file-processing/processingFileStatuses';
import { useEffect, useState, useSyncExternalStore } from 'react';

// User-actionable terminal statuses observed by the upload step. `COMPLETED`
// advances to the success modal; `REQUIRES_APPROVAL` advances to the diff
// step. Any other status counts as "still in flight" here, even though the
// shared `ACTIVE_WORKFLOW_STATUSES` includes `REQUIRES_APPROVAL` for the
// project-level banner that should stay visible until ingestion finishes.
const UPLOAD_COMPLETION_TERMINAL_STATUSES: ReadonlySet<WorkflowStatusEnum> =
  new Set<WorkflowStatusEnum>(['COMPLETED', 'REQUIRES_APPROVAL']);

const DEFAULT_TIMEOUT_POLLS = 20;
const FAILED_APPROVAL_STATUSES: ReadonlySet<ZipApprovalStatus> =
  new Set<ZipApprovalStatus>(['FAILED_APPROVE']);

type UseUploadCompletionPollingParams = {
  zipFileId: string | null;
  projectId: string | null;
  enabled: boolean;
  // Maximum number of polls without seeing the target zip row before failing.
  // Defaults to 20 (≈60s at the 3s polling interval).
  maxMissingPolls?: number;
};

type MissingPollCounterStore = {
  getSnapshot: () => number;
  observePoll: (params: {
    dataUpdatedAt: number;
    enabled: boolean;
    hasTargetInPoll: boolean;
    pollingSessionKey: string;
    zipFileId: string | null;
  }) => void;
  subscribe: (listener: () => void) => () => void;
};

/**
 * Creates a tiny external counter for one upload polling hook instance.
 *
 * The store owns session resets so query snapshots from a previous ZIP id do
 * not count as fresh missing polls for the next upload session.
 */
const createMissingPollCounterStore = (
  initialPollingSessionKey: string,
): MissingPollCounterStore => {
  const listeners = new Set<() => void>();
  let lastObservedDataUpdatedAt = 0;
  let missingPollCount = 0;
  let pollingSessionKey = initialPollingSessionKey;

  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getSnapshot: () => missingPollCount,
    observePoll: ({
      dataUpdatedAt,
      enabled,
      hasTargetInPoll,
      pollingSessionKey: nextPollingSessionKey,
      zipFileId,
    }) => {
      if (pollingSessionKey !== nextPollingSessionKey) {
        pollingSessionKey = nextPollingSessionKey;
        lastObservedDataUpdatedAt = dataUpdatedAt;

        if (missingPollCount !== 0) {
          missingPollCount = 0;
          emit();
        }
        return;
      }

      if (
        !enabled ||
        zipFileId === null ||
        dataUpdatedAt === 0 ||
        dataUpdatedAt === lastObservedDataUpdatedAt
      ) {
        return;
      }

      lastObservedDataUpdatedAt = dataUpdatedAt;
      const nextMissingPollCount = hasTargetInPoll ? 0 : missingPollCount + 1;

      if (nextMissingPollCount === missingPollCount) {
        return;
      }

      missingPollCount = nextMissingPollCount;
      emit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

/**
 * Polls the backend for the uploaded ZIP's workflow status while enabled.
 *
 * The polled record can be missing for two reasons during the upload phase: the
 * `start-processing` call has not been observed yet, or the row never appeared
 * because the backend rejected it. The hook exposes `isProcessingFailed` so the
 * dialog can fail-closed when the polled query itself errors or the target row
 * never appears within the soft timeout, instead of staying in `'uploading'`
 * indefinitely.
 *
 * @param params.zipFileId Confirmed ZIP file id returned by the upload step.
 * @param params.projectId Project that owns the upload.
 * @param params.enabled Whether polling should run (typically while the dialog is in the uploading phase).
 * @param params.maxMissingPolls Soft timeout: after this many polls without the target zip row, the hook reports failure.
 * @returns isProcessingComplete — true when the polled workflow has left the active set; isProcessingFailed — true on a backend-failure status, when the polled query errors, or when the soft timeout elapses without seeing the target row; terminalStatus — the polled zip's current workflow status, used by callers to distinguish auto-approved (`COMPLETED`) from pending-approval (`REQUIRES_APPROVAL`) terminations; terminalApprovalStatus — the polled zip's current approval/version creation status.
 */
export const useUploadCompletionPolling = (
  params: UseUploadCompletionPollingParams,
) => {
  const {
    zipFileId,
    projectId,
    enabled,
    maxMissingPolls = DEFAULT_TIMEOUT_POLLS,
  } = params;

  // Shares the versioned processing-files query with `useProjectProcessingState`
  // so the table poller and the dialog poller dedupe to a single 3s fetch.
  const {
    data: processingFiles = [],
    isError,
    dataUpdatedAt,
  } = useProcessingFilesQuery({
    projectId,
    enabled: enabled && zipFileId !== null,
    pollUntilZipFileId: zipFileId,
  });

  const zipFile = processingFiles.find((file) => file.id === zipFileId) ?? null;
  const status: WorkflowStatusEnum | undefined = zipFile?.workflowStatus;
  const approvalStatus: ZipApprovalStatus | null | undefined =
    zipFile?.approvalStatus;

  const pollingSessionKey = enabled
    ? `${projectId ?? ''}:${zipFileId ?? ''}`
    : '';
  // eslint-disable-next-line no-restricted-syntax -- creates one external missing-poll counter store for this hook instance.
  const [missingPollCounterStore] = useState(() =>
    createMissingPollCounterStore(pollingSessionKey),
  );

  // Stable per-poll signal: did the target zip appear in the latest response?
  // Derived outside the effect so the effect's deps stay scalar and only the
  // `dataUpdatedAt` tick (one increment per poll) drives the counter forward.
  const hasTargetInPoll = zipFile !== null;

  // Bridge each fresh poll response into the missing-poll counter so the soft
  // timeout is observable to the consumer (effect-only because `dataUpdatedAt`
  // changes once per poll regardless of whether `processingFiles` shape changed).
  const missingPollCount = useSyncExternalStore(
    missingPollCounterStore.subscribe,
    missingPollCounterStore.getSnapshot,
    missingPollCounterStore.getSnapshot,
  );

  // eslint-disable-next-line no-restricted-syntax -- TanStack Query v5 has no per-poll callback for `useQuery`, and the timeout requires counting fresh responses keyed by `dataUpdatedAt`.
  useEffect(() => {
    missingPollCounterStore.observePoll({
      dataUpdatedAt,
      enabled,
      hasTargetInPoll,
      pollingSessionKey,
      zipFileId,
    });
  }, [
    dataUpdatedAt,
    enabled,
    hasTargetInPoll,
    missingPollCounterStore,
    pollingSessionKey,
    zipFileId,
  ]);

  const hasTimedOut = missingPollCount >= maxMissingPolls;

  const isProcessingFailed =
    isError ||
    isFailedWorkflowStatus(status) ||
    FAILED_APPROVAL_STATUSES.has(approvalStatus ?? 'APPROVED') ||
    hasTimedOut;
  const isProcessingComplete =
    zipFile !== null &&
    status !== undefined &&
    UPLOAD_COMPLETION_TERMINAL_STATUSES.has(status);

  return {
    isProcessingComplete,
    isProcessingFailed,
    terminalStatus: status,
    terminalApprovalStatus: approvalStatus,
  };
};
