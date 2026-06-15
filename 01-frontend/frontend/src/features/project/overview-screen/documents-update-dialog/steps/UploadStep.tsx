import { Button } from '@/features/ui/button/Button';
import { CloudUpload } from 'lucide-react';
import { useRef } from 'react';
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
  'upload-failed': 'Documents.updateDocuments.upload.errors.uploadFailed',
  'processing-failed':
    'Documents.updateDocuments.upload.errors.processingFailed',
} as const satisfies Record<UploadGlobalError, string>;

export const UploadStep = () => {
  const { t } = useTranslation('Project');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { files, isUploading, globalError, addFiles, startUpload, close } =
    useDocumentsUploadContext();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files ? Array.from(event.target.files) : [];
    if (selected.length > 0) {
      addFiles(selected);
    }
    event.target.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const dropped = Array.from(event.dataTransfer.files);
    if (dropped.length > 0) {
      addFiles(dropped);
    }
  };

  const triggerSelect = () => fileInputRef.current?.click();

  const hasValidQueuedZip = files.some(
    (entry) => entry.status === 'queued' && isZipFile(entry.file.name),
  );

  const isEmpty = files.length === 0;

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
            onDragOver={(event) => event.preventDefault()}
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

        {globalError && (
          <p role="alert" className="text-[13px] leading-[18px] text-red-700">
            {t(GLOBAL_ERROR_MESSAGE_KEY[globalError])}
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          multiple
          className="hidden"
          onChange={handleFileChange}
          aria-hidden
          tabIndex={-1}
        />
      </div>
    </DialogShell>
  );
};
