import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { Button } from '@/features/ui/button/Button';
import { DialogBody, DialogFooter } from '@/features/ui/dialog/Dialog';
import { CloudUpload, FileSpreadsheet } from 'lucide-react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { FileUploadDropZone } from '../shared-ui/FileUploadDropZone';
import { IMPORT_FILE_ACCEPT } from './erwiderungImportFile';

type ErwiderungImportFileUploadStepProps = {
  fileInputRef: RefObject<HTMLInputElement | null>;
  selectedFile: File | null;
  uploadError: string | null;
  onCancel: () => void;
  onFileSelect: (file: File | undefined) => void;
  onRemoveFile: () => void;
  onSubmit: () => void;
};

export const ErwiderungImportFileUploadStep = (
  props: ErwiderungImportFileUploadStepProps,
) => {
  const {
    fileInputRef,
    selectedFile,
    uploadError,
    onCancel,
    onFileSelect,
    onRemoveFile,
    onSubmit,
  } = props;
  const { t } = useTranslation('Ewms');
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });

  return (
    <>
      <DialogBody className="flex flex-col gap-4 px-5 py-6">
        <FileUploadDropZone
          accept={IMPORT_FILE_ACCEPT}
          canMutateProject={canMutateProject}
          fileInputRef={fileInputRef}
          icon={CloudUpload}
          selectedFileIcon={FileSpreadsheet}
          selectedFile={selectedFile}
          translationKey="responseImportDialog"
          uploadError={uploadError}
          onFileSelect={onFileSelect}
          onRemoveFile={onRemoveFile}
        />
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t('responseImportDialog.cancel')}
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!selectedFile || !canMutateProject}
          onClick={() => {
            if (!canMutateProject) {
              return;
            }

            onSubmit();
          }}
        >
          {t('responseImportDialog.next')}
        </Button>
      </DialogFooter>
    </>
  );
};
