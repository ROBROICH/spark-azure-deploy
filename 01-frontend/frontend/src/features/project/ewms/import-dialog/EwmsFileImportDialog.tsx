import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useSystemLoad } from '@/features/workflow-runtime/system-load/useSystemLoad';
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
import type { EwmsFileReviewResult } from './ewmsFileReviewResult';
import { FileImportProgressStep } from './FileImportProgressStep';
import { FileImportStatusLoadingStep } from './FileImportStatusLoadingStep';
import { FileReviewStep } from './FileReviewStep';
import { FileUploadStep, isZipFile } from './FileUploadStep';
import {
  uploadEwmsZip,
  type EwmsZipProcessingWorkflow,
  type EwmsZipUploadResult,
} from './uploadEwmsZip';

type FileImportStep = 'upload' | 'importing' | 'review';

type EwmsFileImportDialogProps = {
  open: boolean;
  projectId: string;
  isImportStatusLoading?: boolean;
  onOpenChange: (open: boolean) => void;
  onProcessingStarted?: (
    processingWorkflow: EwmsZipProcessingWorkflow,
  ) => Promise<void> | void;
  onUploadStarted?: () => Promise<void> | void;
  onUploaded: (uploadResult: EwmsZipUploadResult) => Promise<void> | void;
};

/**
 * Project-level EWMS file import flow. The URL only controls whether this
 * dialog is open; the import steps always start at upload and advance locally.
 */
export const EwmsFileImportDialog = (props: EwmsFileImportDialogProps) => {
  const {
    open,
    projectId,
    isImportStatusLoading = false,
    onOpenChange,
    onProcessingStarted,
    onUploadStarted,
    onUploaded,
  } = props;
  const { t } = useTranslation('Ewms');
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const {
    isError: isSystemLoadError,
    isLoading: isSystemLoadLoading,
    isSystemLoadHigh,
    disableThresholdPercentage,
  } = useSystemLoad();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isInitialImportBlockedBySystemLoad =
    isSystemLoadLoading || isSystemLoadError || isSystemLoadHigh;

  // eslint-disable-next-line no-restricted-syntax -- selected ZIP is transient dialog state before the upload handshake starts.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- upload error feedback is scoped to this dialog.
  const [uploadError, setUploadError] = useState<string | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- dialog step state must start at upload on every open and is not deep-linkable.
  const [step, setStep] = useState<FileImportStep>('upload');
  // eslint-disable-next-line no-restricted-syntax -- file review data belongs to this one-shot import dialog session.
  const [fileReview, setFileReview] = useState<EwmsFileReviewResult | null>(
    null,
  );

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
  };

  const selectFile = (file: File | undefined) => {
    if (!canMutateProject) {
      return;
    }

    if (!file) {
      return;
    }

    if (!isZipFile(file)) {
      setUploadError(t('importDialog.invalidFileType'));
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setUploadError(null);
  };

  /** Reports technical upload failures to Sentry while showing only localized generic errors in the dialog. */
  const handleUpload = async () => {
    if (!canMutateProject || isInitialImportBlockedBySystemLoad) {
      return;
    }

    if (!selectedFile) {
      setUploadError(t('importDialog.missingFile'));
      return;
    }

    void Promise.resolve(onUploadStarted?.()).catch(() => undefined);
    setStep('importing');
    setUploadError(null);
    setFileReview(null);

    try {
      const uploadResult = await uploadEwmsZip({
        file: selectedFile,
        onProcessingStarted,
        projectId,
      });
      await onUploaded(uploadResult);
      setFileReview(uploadResult.fileReview);
      setStep('review');
    } catch (error) {
      Sentry.captureException(error, {
        tags: {
          area: 'ewms',
          flow: 'zip-import',
        },
        extra: {
          projectId,
        },
      });
      setUploadError(t('importDialog.uploadError'));
      setStep('upload');
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="sm:max-w-[620px]"
        innerClassName="max-h-[90vh]"
        showCloseButton={step !== 'importing'}
      >
        <DialogHeader>
          <DialogTitle>{t('importDialog.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t('importDialog.description')}
          </DialogDescription>
        </DialogHeader>

        {isImportStatusLoading ? <FileImportStatusLoadingStep /> : null}

        {!isImportStatusLoading && step === 'upload' ? (
          <FileUploadStep
            fileInputRef={fileInputRef}
            isSystemLoadStartBlocked={isInitialImportBlockedBySystemLoad}
            isSystemLoadStartLoading={isSystemLoadLoading}
            systemLoadDisableThresholdPercentage={disableThresholdPercentage}
            showSystemLoadStartTooltip={isSystemLoadHigh}
            selectedFile={selectedFile}
            uploadError={uploadError}
            onCancel={() => handleOpenChange(false)}
            onFileSelect={selectFile}
            onRemoveFile={() => setSelectedFile(null)}
            onSubmit={handleUpload}
          />
        ) : null}

        {!isImportStatusLoading && step === 'importing' ? (
          <FileImportProgressStep />
        ) : null}

        {!isImportStatusLoading && step === 'review' ? (
          <FileReviewStep
            fileReview={fileReview}
            onClose={() => handleOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
