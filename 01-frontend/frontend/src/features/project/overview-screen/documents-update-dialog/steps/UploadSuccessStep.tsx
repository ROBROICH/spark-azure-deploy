import { Button } from '@/features/ui/button/Button';
import { CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DialogShell } from '../dialog-content/DialogShell';
import { useDocumentsUploadContext } from '../DocumentsUploadContext';

export const UploadSuccessStep = () => {
  const { t } = useTranslation('Project');
  const { close } = useDocumentsUploadContext();

  return (
    <DialogShell
      width="narrow"
      title={t('Documents.updateDocuments.uploadSuccess.title')}
      footer={
        <div className="ml-auto">
          <Button variant="primary" size="default" onClick={close}>
            {t('Documents.updateDocuments.uploadSuccess.close')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
        <CircleCheck aria-hidden className="size-8 text-green-700" />
        <div className="flex w-[356px] max-w-full flex-col items-center gap-2">
          <span className="text-base leading-5 font-medium tracking-[-0.01em] text-brand-navy">
            {t('Documents.updateDocuments.uploadSuccess.heading')}
          </span>
          <span className="text-[13px] leading-[18px] tracking-[-0.01em] text-slate-600">
            {t('Documents.updateDocuments.uploadSuccess.description')}
          </span>
        </div>
      </div>
    </DialogShell>
  );
};
