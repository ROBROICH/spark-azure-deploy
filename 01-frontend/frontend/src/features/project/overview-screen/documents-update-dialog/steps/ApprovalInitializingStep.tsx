import { Button } from '@/features/ui/button/Button';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DialogShell } from '../dialog-content/DialogShell';

export const ApprovalInitializingStep = () => {
  const { t } = useTranslation('Project');

  return (
    <DialogShell
      width="narrow"
      title={t('Documents.updateDocuments.approvalInitializing.title')}
      lockClose
      footer={
        <div className="ml-auto">
          <Button variant="primary" size="default" loading>
            {t('Documents.updateDocuments.approvalInitializing.initializing')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
        <Loader2 aria-hidden className="size-8 animate-spin text-brand-navy" />
        <span className="w-[356px] max-w-full text-base leading-5 font-medium tracking-[-0.01em] text-brand-navy">
          {t('Documents.updateDocuments.approvalInitializing.description')}
        </span>
      </div>
    </DialogShell>
  );
};
