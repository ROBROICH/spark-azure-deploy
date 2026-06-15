import type { UploadPhase } from './DocumentsUploadContext.types';

type ToastVariant = 'uploading' | 'success';

type PhasePresentationPolicy = {
  keepDialogOpenWhenMinimized: boolean;
  toastVariant: ToastVariant | null;
  toastCanClose: boolean;
};

const PHASE_PRESENTATION = {
  idle: {
    keepDialogOpenWhenMinimized: false,
    toastVariant: null,
    toastCanClose: false,
  },
  selecting: {
    keepDialogOpenWhenMinimized: false,
    toastVariant: null,
    toastCanClose: false,
  },
  uploading: {
    keepDialogOpenWhenMinimized: false,
    toastVariant: 'uploading',
    toastCanClose: false,
  },
  diff: {
    keepDialogOpenWhenMinimized: true,
    toastVariant: null,
    toastCanClose: false,
  },
  'approval-initializing': {
    keepDialogOpenWhenMinimized: false,
    toastVariant: null,
    toastCanClose: false,
  },
  'upload-success': {
    keepDialogOpenWhenMinimized: false,
    toastVariant: null,
    toastCanClose: false,
  },
  'ai-processes': {
    keepDialogOpenWhenMinimized: false,
    toastVariant: 'success',
    toastCanClose: true,
  },
} as const satisfies Record<UploadPhase, PhasePresentationPolicy>;

export const getUploadPhasePresentation = (
  phase: UploadPhase,
  minimized: boolean,
) => {
  const policy = PHASE_PRESENTATION[phase];
  const isDialogOpen =
    phase !== 'idle' && (!minimized || policy.keepDialogOpenWhenMinimized);
  const toastVariant = minimized ? policy.toastVariant : null;

  return {
    isDialogOpen,
    toastVariant,
    toastCanClose: toastVariant !== null && policy.toastCanClose,
  };
};
