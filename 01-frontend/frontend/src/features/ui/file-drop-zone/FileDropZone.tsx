import { Button } from '@/features/ui/button/Button';
import { cn } from '@/features/ui/style/cn';
import { CloudUpload, FileArchive, Trash2 } from 'lucide-react';
import type { ChangeEvent, DragEvent, ReactNode, RefObject } from 'react';
import { useId, useRef, useState } from 'react';

type DragState = 'idle' | 'over';

const formatFileSize = (size: number) => {
  if (size >= 1024 * 1024) {
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${size} B`;
};

const getAcceptTokens = (accept: string | undefined) =>
  accept
    ?.split(',')
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean) ?? [];

const fileMatchesAcceptToken = (file: File, token: string) => {
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  if (token.startsWith('.')) {
    return fileName.endsWith(token);
  }

  if (token.endsWith('/*')) {
    return fileType.startsWith(token.slice(0, -1));
  }

  return fileType === token;
};

const isAcceptedFile = (file: File, accept: string | undefined) => {
  const acceptTokens = getAcceptTokens(accept);

  if (acceptTokens.length === 0) {
    return true;
  }

  return acceptTokens.some((token) => fileMatchesAcceptToken(file, token));
};

export type FileDropZoneProps = {
  accept?: string;
  selectedFile: File | null;
  onFileSelect: (file: File | undefined) => void;
  onRejectedFile?: (file: File) => void;
  onRemoveFile: () => void;
  dropZoneTitle: string;
  dropZoneDescription: string;
  formatHint: string;
  chooseFileLabel: string;
  removeFileLabel: string;
  fileInputLabel: string;
  fileInputRef?: RefObject<HTMLInputElement | null>;
  uploadError?: string | null;
  uploadErrorId?: string;
  footer?: ReactNode;
  textMaxWidth?: string;
  className?: string;
};

/**
 * @param props File picker copy, validation hooks, and selected-file state.
 * @returns A drag-and-drop upload area that keeps button-based file selection available for keyboard users.
 */
export const FileDropZone = (props: FileDropZoneProps) => {
  const {
    accept,
    selectedFile,
    onFileSelect,
    onRejectedFile,
    onRemoveFile,
    dropZoneTitle,
    dropZoneDescription,
    formatHint,
    chooseFileLabel,
    removeFileLabel,
    fileInputLabel,
    fileInputRef: externalRef,
    uploadError,
    uploadErrorId: uploadErrorIdProp,
    footer,
    textMaxWidth = 'max-w-[320px]',
    className,
  } = props;

  const [dragState, setDragState] = useState<DragState>('idle');
  const errorId = useId();
  const internalRef = useRef<HTMLInputElement>(null);
  const inputRef = externalRef ?? internalRef;
  const hasUploadError = Boolean(uploadError);
  const uploadErrorId = hasUploadError
    ? (uploadErrorIdProp ?? errorId)
    : undefined;

  const selectAcceptedFile = (file: File | undefined) => {
    if (file && !isAcceptedFile(file, accept)) {
      onRejectedFile?.(file);
      return;
    }

    onFileSelect(file);
  };

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    selectAcceptedFile(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragState('over');
  };

  const handleDragLeave = () => {
    setDragState('idle');
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragState('idle');
    selectAcceptedFile(event.dataTransfer.files[0]);
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
        aria-label={fileInputLabel}
        aria-describedby={uploadErrorId}
        aria-invalid={hasUploadError || undefined}
      />

      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- HTML has no native file drop-zone element; keyboard access remains available through the file picker button. */}
      <div
        data-slot="file-drop-zone"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'flex h-full min-h-[360px] flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors sm:p-10',
          dragState === 'over'
            ? 'border-brand-950 bg-neutral-50'
            : 'border-slate-300 bg-slate-50',
        )}
      >
        <CloudUpload className="size-8 text-brand-950" aria-hidden="true" />

        <div
          className={cn('mt-5 flex flex-col items-center gap-1', textMaxWidth)}
        >
          <p className="text-base leading-6 font-medium text-text-primary">
            {dropZoneTitle}
          </p>
          <p className="text-[13px] leading-[18px] text-text-secondary">
            {dropZoneDescription}
          </p>
        </div>

        <div className="mt-6">
          {selectedFile ? (
            <div className="flex w-full max-w-[500px] items-center gap-2 rounded-md border border-border-primary bg-neutral-white px-3 py-2 text-left">
              <FileArchive
                className="size-4 shrink-0 text-text-secondary"
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] leading-[18px] text-text-primary">
                  {selectedFile.name}
                </p>
                <p className="text-[13px] leading-[18px] text-text-secondary">
                  {formatFileSize(selectedFile.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                iconOnly
                aria-label={removeFileLabel}
                onClick={onRemoveFile}
              >
                <Trash2 aria-hidden />
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => inputRef.current?.click()}
              aria-describedby={uploadErrorId}
              aria-invalid={hasUploadError || undefined}
            >
              {chooseFileLabel}
            </Button>
          )}
        </div>

        <p className="mt-4 text-[13px] leading-[18px] text-text-secondary">
          {formatHint}
        </p>
      </div>

      {uploadError ? (
        <p
          id={uploadErrorId}
          role="alert"
          className="rounded-md border border-border-error bg-highlight-error px-3 py-2 text-[13px] leading-[18px] text-text-error"
        >
          {uploadError}
        </p>
      ) : null}

      {footer}
    </div>
  );
};
