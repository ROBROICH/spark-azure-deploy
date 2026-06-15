import { Button } from '@/features/ui/button/Button';
import { cn } from '@/features/ui/style/cn';
import { Trash2, type LucideIcon } from 'lucide-react';
import type { ChangeEvent, DragEvent, RefObject } from 'react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

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

type FileUploadDropZoneProps = {
  accept: string;
  canMutateProject: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  icon: LucideIcon;
  selectedFileIcon: LucideIcon;
  selectedFile: File | null;
  translationKey: 'importDialog' | 'responseImportDialog';
  uploadError: string | null;
  onFileSelect: (file: File | undefined) => void;
  onRemoveFile: () => void;
};

/** Keeps drag/drop, the hidden file input, and error id wiring in one place while callers own file validation. */
export const FileUploadDropZone = (props: FileUploadDropZoneProps) => {
  const {
    accept,
    canMutateProject,
    fileInputRef,
    icon: Icon,
    selectedFileIcon: SelectedFileIcon,
    selectedFile,
    translationKey,
    uploadError,
    onFileSelect,
    onRemoveFile,
  } = props;
  const { t } = useTranslation('Ewms');
  const errorId = useId();
  // eslint-disable-next-line no-restricted-syntax -- drag highlight is local interaction state for the dialog drop-zone.
  const [dragState, setDragState] = useState<DragState>('idle');

  const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
    if (!canMutateProject) {
      event.target.value = '';
      return;
    }

    onFileSelect(event.target.files?.[0]);
    event.target.value = '';
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!canMutateProject) {
      return;
    }

    setDragState('over');
  };

  const handleDragLeave = () => {
    setDragState('idle');
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragState('idle');
    if (!canMutateProject) {
      return;
    }

    onFileSelect(event.dataTransfer.files[0]);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        disabled={!canMutateProject}
        className="hidden"
        aria-label={t(`${translationKey}.fileInputLabel`)}
        aria-invalid={Boolean(uploadError)}
        aria-describedby={uploadError ? errorId : undefined}
      />

      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- HTML has no native file drop-zone element; keyboard access remains available through the file picker button. */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'flex min-h-[220px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-6 text-center transition-colors',
          dragState === 'over'
            ? 'border-brand-950 bg-neutral-50'
            : 'border-border-primary bg-bg-secondary',
        )}
      >
        <Icon className="size-8 text-brand-950" aria-hidden />

        <div className="flex max-w-[320px] flex-col items-center gap-1">
          <p className="text-[13px] leading-[18px] font-medium text-text-primary">
            {t(`${translationKey}.dropZoneTitle`)}
          </p>
          <p className="text-[11px] leading-[14px] text-text-secondary">
            {t(`${translationKey}.dropZoneDescription`)}
          </p>
        </div>

        {selectedFile ? (
          <div className="flex w-full max-w-[500px] items-center gap-2 rounded-md border border-border-primary bg-neutral-white px-3 py-2 text-left">
            <SelectedFileIcon
              className="size-4 shrink-0 text-text-secondary"
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] leading-[18px] text-text-primary">
                {selectedFile.name}
              </p>
              <p className="text-[11px] leading-[14px] text-text-secondary">
                {formatFileSize(selectedFile.size)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              iconOnly
              aria-label={t(`${translationKey}.removeFile`)}
              disabled={!canMutateProject}
              onClick={() => {
                if (!canMutateProject) {
                  return;
                }

                onRemoveFile();
              }}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={!canMutateProject}
            onClick={() => {
              if (!canMutateProject) {
                return;
              }

              fileInputRef.current?.click();
            }}
          >
            {t(`${translationKey}.chooseFile`)}
          </Button>
        )}

        <p className="text-[11px] leading-[14px] text-text-secondary">
          {t(`${translationKey}.formatHint`)}
        </p>
      </div>

      {uploadError ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-md border border-border-error bg-highlight-error px-3 py-2 text-[13px] leading-[18px] text-text-error"
        >
          {uploadError}
        </p>
      ) : null}
    </>
  );
};
