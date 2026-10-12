import { Button } from '@/features/ui/button/Button';
import { zipProcessingFailureMessageKey } from '@/features/project/data/file-processing/zipProcessingFailureMessages';
import { CloudUpload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogShell } from '../dialog-content/DialogShell';
import { FileItemRow } from '../dialog-content/FileItemRow';
import {
  useDocumentsUploadContext,
  type UploadGlobalError,
} from '../DocumentsUploadContext';

const ACCEPTED_FILE_TYPES = '.zip';

const isZipFile = (filename: string) => filename.toLowerCase().endsWith('.zip');

const GLOBAL_ERROR_MESSAGE_KEY = {
  'zip-required': 'Documents.updateDocuments.upload.errors.unsupportedFormat',
  'single-zip-required':
    'Documents.updateDocuments.upload.errors.singleZipRequired',
  'upload-failed': 'Documents.updateDocuments.upload.errors.uploadFailed',
  'processing-failed':
    'Documents.updateDocuments.upload.errors.processingFailed',
} as const satisfies Record<UploadGlobalError, string>;

/**
 * Keeps multi-file selections out of the single-ZIP update workflow.
 * Drag previews use item counts; the drop handler validates the actual selection.
 * @returns Upload controls and feedback for selecting one archive.
 */
export const UploadStep = () => {
  const { t } = useTranslation('Project');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // eslint-disable-next-line no-restricted-syntax -- drag rejection is transient feedback for this drop target.
  const [isDropRejected, setIsDropRejected] = useState(false);
  const {
    files,
    isUploading,
    globalError,
    uploadErrorDetails,
    addFiles,
    startUpload,
    close,
  } = useDocumentsUploadContext();

  const selectFiles = (selected: File[]) => {
    if (selected.length === 0) {
      return;
    }
    const rejected = selected.length > 1;
    setIsDropRejected(rejected);
    if (!rejected) {
      addFiles(selected);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    selectFiles(event.target.files ? Array.from(event.target.files) : []);
    event.target.value = '';
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const fileCount = Array.from(event.dataTransfer.items).filter(
      (item) => item.kind === 'file',
    ).length;
    const rejected = fileCount > 1;
    event.dataTransfer.dropEffect = rejected ? 'none' : 'copy';
    setIsDropRejected(rejected);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    if (
      event.relatedTarget instanceof Node &&
      event.currentTarget.contains(event.relatedTarget)
    ) {
      return;
    }
    setIsDropRejected(false);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    selectFiles(Array.from(event.dataTransfer.files));
  };

  const triggerSelect = () => fileInputRef.current?.click();

  const hasValidQueuedZip = files.some(
    (entry) => entry.status === 'queued' && isZipFile(entry.file.name),
  );

  const isEmpty = files.length === 0;
  const displayedError = isDropRejected ? 'single-zip-required' : globalError;

  return (
    <DialogShell
      width="narrow"
      title={t('Documents.updateDocuments.upload.title')}
      footer={
        <>
          <Button
            variant="ghost"
            size="default"
            onClick={close}
            disabled={isUploading}
          >
            {t('Documents.updateDocuments.upload.cancel')}
          </Button>
          <Button
            variant="primary"
            size="default"
            onClick={startUpload}
            disabled={!hasValidQueuedZip || isUploading}
            loading={isUploading}
          >
            {t('Documents.updateDocuments.upload.next')}
          </Button>
        </>
      }
    >
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {isEmpty ? (
          // The dropzone is a decorative drop target; keyboard users open the
          // file picker via the named "Unterlagen auswählen" button below.
          // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- drag-and-drop has no equivalent native interactive element; the named "Unterlagen auswählen" button covers keyboard users.
          <div
            className="flex flex-col items-center gap-6 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-10"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <span className="flex size-8 items-center justify-center p-1">
              <CloudUpload
                aria-hidden
                className="size-[26.66px] text-slate-600"
              />
            </span>
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="text-base leading-5 font-medium tracking-[-0.01em] text-brand-navy">
                {t('Documents.updateDocuments.upload.dropzoneTitle')}
              </span>
              <span className="text-[13px] leading-[18px] tracking-[-0.01em] text-slate-600">
                {t('Documents.updateDocuments.upload.dropzoneText')}
              </span>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={triggerSelect}
              disabled={isUploading}
            >
              {t('Documents.updateDocuments.upload.selectButton')}
            </Button>
            <span className="text-[11px] leading-[14px] tracking-[0.02em] text-slate-600">
              {t('Documents.updateDocuments.upload.formatHint')}
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <h3 className="text-[13px] leading-[18px] font-medium tracking-[-0.01em] text-brand-navy">
              {t('Documents.updateDocuments.upload.uploadedListTitle')}
            </h3>
            <div className="flex flex-col gap-2">
              {files.map((entry) => (
                <FileItemRow key={entry.id} entry={entry} />
              ))}
            </div>
          </div>
        )}

        {displayedError && (
          <p role="alert" className="text-[13px] leading-[18px] text-red-700">
            {t(
              displayedError === 'processing-failed'
                ? zipProcessingFailureMessageKey(
                    uploadErrorDetails?.workflowFailureCode,
                    GLOBAL_ERROR_MESSAGE_KEY[displayedError],
                  )
                : GLOBAL_ERROR_MESSAGE_KEY[displayedError],
            )}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          className="hidden"
          onChange={handleFileChange}
          aria-hidden
          tabIndex={-1}
        />
      </div>
    </DialogShell>
  );
};
