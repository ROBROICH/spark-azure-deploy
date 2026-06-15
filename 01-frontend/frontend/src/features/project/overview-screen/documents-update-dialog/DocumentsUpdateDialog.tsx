import { Dialog } from '@/features/ui/dialog/Dialog';
import { type ComponentType } from 'react';
import { ApprovalInitializingStep } from './steps/ApprovalInitializingStep';
import { AiProcessesStep } from './steps/AiProcessesStep';
import { DocumentDiffStep } from './steps/DocumentDiffStep';
import { UploadProgressStep } from './steps/UploadProgressStep';
import { UploadStep } from './steps/UploadStep';
import { UploadSuccessStep } from './steps/UploadSuccessStep';
import { useDocumentsUploadContext } from './DocumentsUploadContext';
import type { UploadPhase } from './DocumentsUploadContext.types';
import { getUploadPhasePresentation } from './uploadPhasePresentation';

const STEP_BY_PHASE = {
  idle: null,
  selecting: UploadStep,
  uploading: UploadProgressStep,
  diff: DocumentDiffStep,
  'approval-initializing': ApprovalInitializingStep,
  'upload-success': UploadSuccessStep,
  'ai-processes': AiProcessesStep,
} as const satisfies Record<UploadPhase, ComponentType | null>;

export const DocumentsUpdateDialog = () => {
  const { phase, minimized, close } = useDocumentsUploadContext();
  const { isDialogOpen } = getUploadPhasePresentation(phase, minimized);
  const StepComponent = STEP_BY_PHASE[phase];

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
    >
      {StepComponent && <StepComponent />}
    </Dialog>
  );
};
