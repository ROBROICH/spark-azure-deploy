import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { Button } from '@/features/ui/button/Button';
import { DialogBody, DialogFooter } from '@/features/ui/dialog/Dialog';
import { CloudUpload, FileArchive } from 'lucide-react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FileUploadDropZone } from '../shared-ui/FileUploadDropZone';

const ZIP_FILE_EXTENSION = '.zip';

const systemLoadFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 1,
});

export const isZipFile = (file: File) =>
  file.name.toLowerCase().endsWith(ZIP_FILE_EXTENSION);

type FileUploadStepProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  isSystemLoadStartBlocked: boolean;
  isSystemLoadStartLoading: boolean;
  selectedFile: File | null;
  showSystemLoadStartTooltip: boolean;
  systemLoadDisableThresholdPercentage: number;
  uploadError: string | null;
  onCancel: () => void;
  onFileSelect: (file: File | undefined) => void;
  onRemoveFile: () => void;
  onSubmit: () => void;
};

export const FileUploadStep = (props: FileUploadStepProps) => {
  const {
    fileInputRef,
    isSystemLoadStartBlocked,
    isSystemLoadStartLoading,
    selectedFile,
    showSystemLoadStartTooltip,
    systemLoadDisableThresholdPercentage,
    uploadError,
    onCancel,
    onFileSelect,
    onRemoveFile,
    onSubmit,
  } = props;
  const { t } = useTranslation(['Ewms', 'shared']);
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const isNextDisabled =
    !selectedFile || !canMutateProject || isSystemLoadStartBlocked;
  const shouldShowSystemLoadTooltip =
    Boolean(selectedFile) && canMutateProject && showSystemLoadStartTooltip;
  const formattedSystemLoadDisableThresholdPercentage =
    systemLoadFormatter.format(systemLoadDisableThresholdPercentage);

  return (
    <>
      <DialogBody className="flex flex-col gap-4 px-5 py-6">
        <FileUploadDropZone
          accept=".zip"
          canMutateProject={canMutateProject}
          fileInputRef={fileInputRef}
          icon={CloudUpload}
          selectedFileIcon={FileArchive}
          selectedFile={selectedFile}
          translationKey="importDialog"
          uploadError={uploadError}
          onFileSelect={onFileSelect}
          onRemoveFile={onRemoveFile}
        />

        <p className="text-[13px] leading-[18px] text-text-secondary">
          {t('importDialog.analysisStartHint')}
        </p>
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('importDialog.cancel')}
        </Button>
        <TooltipWrapper
          content={
            shouldShowSystemLoadTooltip
              ? t('projectNavbar.startProcessDisabledBySystemLoad', {
                  ns: 'shared',
                  threshold: formattedSystemLoadDisableThresholdPercentage,
                })
              : undefined
          }
          side="top"
          align="end"
        >
          <span
            className="inline-flex"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- tooltip focus proxy for a disabled button, which cannot receive focus events itself
            tabIndex={isNextDisabled ? 0 : undefined}
          >
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={isNextDisabled}
              loading={Boolean(selectedFile) && isSystemLoadStartLoading}
              onClick={() => {
                if (!canMutateProject || isSystemLoadStartBlocked) {
                  return;
                }

                onSubmit();
              }}
            >
              {t('importDialog.next')}
            </Button>
          </span>
        </TooltipWrapper>
      </DialogFooter>
    </>
  );
};
