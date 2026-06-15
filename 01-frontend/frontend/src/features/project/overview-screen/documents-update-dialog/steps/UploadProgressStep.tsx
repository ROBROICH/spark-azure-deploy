import { Button } from '@/features/ui/button/Button';
import { CloudUpload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DialogShell } from '../dialog-content/DialogShell';
import { useDocumentsUploadContext } from '../DocumentsUploadContext';

export const UploadProgressStep = () => {
  const { t } = useTranslation('Project');
  const { close, minimize } = useDocumentsUploadContext();

  return (
    <DialogShell
      width="narrow"
      title={t('Documents.updateDocuments.upload.title')}
      onMinimize={minimize}
      lockClose
      footer={
        <div className="ml-auto">
          <Button variant="ghost" size="default" onClick={close}>
            {t('Documents.updateDocuments.uploading.cancel')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10">
        <CloudUpload aria-hidden className="size-8 text-slate-600" />
        <div className="flex w-[356px] max-w-full flex-col items-center gap-2 text-center">
          <span className="text-base leading-5 font-medium tracking-[-0.01em] text-brand-navy">
            {t('Documents.updateDocuments.uploading.title')}
          </span>
          <span className="text-[13px] leading-[18px] tracking-[-0.01em] text-slate-600">
            {t('Documents.updateDocuments.uploading.description')}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={t('Documents.updateDocuments.uploading.title')}
          className="relative h-2 w-[356px] max-w-full overflow-hidden rounded-full border-[0.5px] border-slate-200 bg-slate-100"
        >
          <div className="absolute top-0 h-full w-16 animate-progress-slide rounded-full bg-brand-navy" />
        </div>
      </div>
    </DialogShell>
  );
};
