import { listZipFilesV2ZipFilesGet } from '@/api-clients/dms-module';
import type {
  WorkflowStatusEnum,
  ZipFileResponse,
  ZipApprovalStatus,
} from '@/api-clients/dms-module';
import {
  isActiveWorkflowStatus,
  isActiveZipApprovalStatus,
} from '@/features/project/data/file-processing/processingFileStatuses';
import { isHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';
import * as Sentry from '@sentry/react';
import type {
  UploadErrorDetails,
  UploadFile,
  UploadGlobalError,
  UploadPhase,
} from './DocumentsUploadContext.types';
import type { UploadZipResult } from './dialog-logic/useZipUpload';

const ZIP_EXTENSION = '.zip';

const isZipFile = (file: File) =>
  file.name.toLowerCase().endsWith(ZIP_EXTENSION);

export type OpenWorkflowPreflight = {
  phase: 'diff' | 'uploading' | 'approval-initializing';
  zipFileId: string;
};

type ZipWorkflowSnapshot = {
  id: string;
  type?: ZipFileResponse['type'];
  workflowStatus?: WorkflowStatusEnum;
  approvalStatus?: ZipApprovalStatus | null;
};

const isProjectDocumentZip = (file: ZipWorkflowSnapshot) =>
  file.type === undefined || file.type === 'zip';

const isPendingApprovalZip = (file: ZipWorkflowSnapshot) =>
  file.workflowStatus === 'REQUIRES_APPROVAL' ||
  file.approvalStatus === 'REQUIRES_APPROVAL';

export const isApprovalInitializingZip = (file: ZipWorkflowSnapshot) =>
  isActiveZipApprovalStatus(file.approvalStatus);

export const resolveOpenWorkflow = (
  files: ReadonlyArray<ZipWorkflowSnapshot>,
): OpenWorkflowPreflight | null => {
  const projectDocumentZips = files.filter(isProjectDocumentZip);
  const pendingApproval = projectDocumentZips.find(isPendingApprovalZip);
  if (pendingApproval) {
    return { phase: 'diff', zipFileId: pendingApproval.id };
  }
  const approvalInitializing = projectDocumentZips.find(
    isApprovalInitializingZip,
  );
  if (approvalInitializing) {
    return {
      phase: 'approval-initializing',
      zipFileId: approvalInitializing.id,
    };
  }
  const active = projectDocumentZips.find((file) =>
    isActiveWorkflowStatus(file.workflowStatus),
  );
  if (active) {
    return { phase: 'uploading', zipFileId: active.id };
  }
  return null;
};

/**
 * Looks up zip files for the given project and returns the dialog phase that
 * should be entered when a workflow is already open. Returns `null` when no
 * open workflow exists (the dialog can proceed to `'selecting'`).
 *
 * @param projectId Owning project of the upload workflow.
 * @returns Preflight transition or `null` when no open workflow exists.
 */
export const lookupOpenWorkflow = async (
  projectId: string,
  projectVersion: number,
): Promise<OpenWorkflowPreflight | null> => {
  const { data } = await listZipFilesV2ZipFilesGet({
    query: {
      projectId,
      project_version: projectVersion,
    },
    throwOnError: true,
  });
  return resolveOpenWorkflow(data);
};

export type StartUploadDeps = {
  projectId: string | null;
  projectVersion: number;
  canMutateProject: boolean;
  files: UploadFile[];
  uploadZip: (file: File, projectId: string) => Promise<UploadZipResult>;
  markFileAsUploadFailed: (id: string) => void;
  setPhase: (phase: UploadPhase) => void;
  setZipFileId: (id: string | null) => void;
  setGlobalError: (error: UploadGlobalError | null) => void;
  setUploadErrorDetails: (details: UploadErrorDetails | null) => void;
};

const recoverFromOpenWorkflowConflict = async (
  deps: StartUploadDeps,
): Promise<boolean> => {
  if (!deps.projectId) {
    return false;
  }

  const preflight = await lookupOpenWorkflow(
    deps.projectId,
    deps.projectVersion,
  ).catch((error: unknown) => {
    Sentry.captureException(error, {
      tags: {
        area: 'documents-update',
        flow: 'conflict-recovery',
      },
      extra: { projectId: deps.projectId },
    });
    return null;
  });

  // The 409-resolved zip belongs to the same project as the original upload, so
  // the canMutateProject check at the top of runStartUpload already guards
  // entry into this recovery path.
  if (!preflight) {
    return false;
  }

  deps.setPhase(preflight.phase);
  deps.setZipFileId(preflight.zipFileId);
  return true;
};

/**
 * Drives the start-upload action: validates the queued zip, transitions the
 * dialog into `uploading`, runs the upload handshake, and rolls back to
 * `selecting` with an `upload-failed` error when the handshake fails.
 *
 * @param deps Workflow state setters and the upload helpers used by the action.
 * @returns A no-arg async action suitable for binding to the upload button.
 */
export const runStartUpload = (deps: StartUploadDeps) => async () => {
  if (!deps.projectId) {
    return;
  }
  // Belt-and-braces: refuse to start the upload if the caller no longer has
  // mutate rights on this project. The trigger is already hidden in
  // SingleProjectDocumentsCard, but failing closed here protects against
  // direct context use or race conditions during membership changes.
  if (!deps.canMutateProject) {
    Sentry.captureException(
      new Error('runStartUpload invoked without project mutate rights.'),
      {
        tags: { area: 'documents-update', flow: 'permission-denied' },
        extra: { projectId: deps.projectId },
      },
    );
    return;
  }
  const targetZip = deps.files.find(
    (entry) => entry.status === 'queued' && isZipFile(entry.file),
  );
  if (!targetZip) {
    deps.setGlobalError('zip-required');
    return;
  }
  deps.setGlobalError(null);
  deps.setUploadErrorDetails(null);
  deps.setPhase('uploading');
  deps.setZipFileId(null);
  const result = await deps.uploadZip(targetZip.file, deps.projectId);
  if (result.kind === 'success') {
    deps.setZipFileId(result.zipFileId);
    return;
  }
  if (isHandledProjectVersionConflictError(result.error)) {
    deps.setPhase('selecting');
    return;
  }
  // 409 from `confirm-upload` or `start-file-processing` means a parallel
  // workflow (PENDING/RUNNING/REQUIRES_APPROVAL) was opened between our
  // pre-open check and the user clicking "Hochladen". Re-run the same
  // preflight as `openForProject` and transition into that workflow instead
  // of surfacing a generic upload-failed error.
  const isRecoverableConflict =
    result.httpStatus === 409 &&
    (result.stage === 'confirm' || result.stage === 'start-processing');
  if (isRecoverableConflict) {
    const recovered = await recoverFromOpenWorkflowConflict(deps);
    if (recovered) {
      return;
    }
  }
  Sentry.captureException(result.error, {
    tags: {
      area: 'documents-update',
      flow: 'zip-upload',
      stage: result.stage,
    },
    extra: {
      projectId: deps.projectId,
    },
  });
  deps.markFileAsUploadFailed(targetZip.id);
  deps.setPhase('selecting');
  deps.setGlobalError('upload-failed');
  deps.setUploadErrorDetails({
    kind: 'upload-failed',
    stage: result.stage,
    error: result.error,
  });
};
