import type {
  UploadErrorDetails,
  UploadGlobalError,
  UploadPhase,
} from './DocumentsUploadContext.types';

export type DocumentsUploadWorkflowState = {
  phase: UploadPhase;
  projectId: string | null;
  zipFileId: string | null;
  minimized: boolean;
  globalError: UploadGlobalError | null;
  uploadErrorDetails: UploadErrorDetails | null;
};

export type DocumentsUploadWorkflowAction =
  | {
      type: 'reset';
      phase: UploadPhase;
      projectId: string | null;
      zipFileId?: string | null;
    }
  | { type: 'resumePendingApproval'; projectId: string; zipFileId: string }
  | { type: 'setPhase'; phase: UploadPhase }
  | { type: 'setProjectId'; projectId: string | null }
  | { type: 'setZipFileId'; zipFileId: string | null }
  | { type: 'setMinimized'; minimized: boolean }
  | { type: 'setGlobalError'; globalError: UploadGlobalError | null }
  | {
      type: 'setUploadErrorDetails';
      uploadErrorDetails: UploadErrorDetails | null;
    };

export const initialWorkflowState: DocumentsUploadWorkflowState = {
  phase: 'idle',
  projectId: null,
  zipFileId: null,
  minimized: false,
  globalError: null,
  uploadErrorDetails: null,
};

/**
 * Applies workflow-level dialog transitions atomically so external workflow
 * observations do not cascade through several independent state setters.
 *
 * @param state Current upload workflow state.
 * @param action Domain transition or field update emitted by workflow actions.
 * @returns Next upload workflow state.
 */
export const documentsUploadWorkflowReducer = (
  state: DocumentsUploadWorkflowState,
  action: DocumentsUploadWorkflowAction,
): DocumentsUploadWorkflowState => {
  switch (action.type) {
    case 'reset':
      return {
        phase: action.phase,
        projectId: action.projectId,
        zipFileId: action.zipFileId ?? null,
        minimized: false,
        globalError: null,
        uploadErrorDetails: null,
      };
    case 'resumePendingApproval':
      return {
        phase: 'diff',
        projectId: action.projectId,
        zipFileId: action.zipFileId,
        minimized: false,
        globalError: null,
        uploadErrorDetails: null,
      };
    case 'setPhase':
      return { ...state, phase: action.phase };
    case 'setProjectId':
      return { ...state, projectId: action.projectId };
    case 'setZipFileId':
      return { ...state, zipFileId: action.zipFileId };
    case 'setMinimized':
      return { ...state, minimized: action.minimized };
    case 'setGlobalError':
      return { ...state, globalError: action.globalError };
    case 'setUploadErrorDetails':
      return { ...state, uploadErrorDetails: action.uploadErrorDetails };
  }
};
