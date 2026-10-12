import type { V1ObjectionsManagementImportObjectionsArgumentsResponse as ImportObjectionsArgumentsResponse } from '@/api-clients/backend';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import * as Sentry from '@sentry/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isErwiderungImportFile } from './erwiderungImportFile';
import { ErwiderungImportFileUploadStep } from './ErwiderungImportFileUploadStep';
import { ErwiderungImportProgressStep } from './ErwiderungImportProgressStep';
import {
  ErwiderungImportResultStep,
  type ErwiderungImportStatus,
} from './ErwiderungImportResultStep';
import { uploadErwiderungImportFile } from './uploadErwiderungImportFile';

type ImportStep = 'upload' | 'importing' | 'result';
type ImportResult = ImportObjectionsArgumentsResponse | null;
type Status = ErwiderungImportStatus;

type ErwiderungImportDialogProps = {
  open: boolean;
  projectId: string;
  onImported: () => Promise<void> | void;
  onOpenChange: (open: boolean) => void;
};

/**
 * Owns the URL-opened Erwiderung import dialog session from file selection
 * through upload, OMS import, and the final success or error result.
 */
export const ErwiderungImportDialog = (props: ErwiderungImportDialogProps) => {
  const { open, projectId, onImported, onOpenChange } = props;
  const { t } = useTranslation('Ewms');
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // eslint-disable-next-line no-restricted-syntax -- selected import file is transient dialog state before the upload handshake starts.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- upload error feedback is scoped to this dialog.
  const [uploadError, setUploadError] = useState<string | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- dialog step state must start at upload on every open and is not deep-linkable.
  const [step, setStep] = useState<ImportStep>('upload');
  // eslint-disable-next-line no-restricted-syntax -- one-shot import result belongs to this dialog session.
  const [importResult, setImportResult] = useState<ImportResult>(null);
  // eslint-disable-next-line no-restricted-syntax -- final success/error state is transient feedback for this dialog session.
  const [importStatus, setImportStatus] = useState<Status>('success');

  const resetDialogState = () => {
    setSelectedFile(null);
    setUploadError(null);
    setImportResult(null);
    setImportStatus('success');
    setStep('upload');
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetDialogState();
    }

    onOpenChange(nextOpen);
  };

  const selectFile = (file: File | undefined) => {
    if (!canMutateProject) {
      return;
    }

    if (!file) {
      return;
    }

    if (!isErwiderungImportFile(file)) {
      setUploadError(t('responseImportDialog.invalidFileType'));
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setUploadError(null);
  };

  /** Uploads the selected response import file only while project mutation rights are present. */
  const handleUpload = async () => {
    if (!canMutateProject) {
      return;
    }

    if (!selectedFile) {
      setUploadError(t('responseImportDialog.missingFile'));
      return;
    }

    setStep('importing');
    setUploadError(null);
    setImportResult(null);
    setImportStatus('success');

    try {
      const nextImportResult = await uploadErwiderungImportFile({
        file: selectedFile,
        projectId,
      });
      await onImported();
      setImportResult(nextImportResult);
      setImportStatus('success');
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          area: 'ewms',
          flow: 'erwiderung-import',
        },
        extra: {
          projectId,
        },
      });
      setImportStatus('error');
    }
    setStep('result');
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[620px]"
        innerClassName="max-h-[90vh]"
        showCloseButton={step !== 'importing'}
      >
        <DialogHeader>
          <DialogTitle>{t('responseImportDialog.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('responseImportDialog.description')}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' ? (
          <ErwiderungImportFileUploadStep
            fileInputRef={fileInputRef}
            selectedFile={selectedFile}
            uploadError={uploadError}
            onCancel={() => handleOpenChange(false)}
            onFileSelect={selectFile}
            onRemoveFile={() => setSelectedFile(null)}
            onSubmit={handleUpload}
          />
        ) : null}

        {step === 'importing' ? <ErwiderungImportProgressStep /> : null}

        {step === 'result' ? (
          <ErwiderungImportResultStep
            importResult={importResult}
            status={importStatus}
            onClose={() => handleOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
