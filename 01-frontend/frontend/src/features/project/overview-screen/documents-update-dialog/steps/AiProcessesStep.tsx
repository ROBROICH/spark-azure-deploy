import { Button } from '@/features/ui/button/Button';
import { getRouteApi, Link } from '@tanstack/react-router';
import { CircleCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DialogShell } from '../dialog-content/DialogShell';
import { useDocumentsUploadContext } from '../DocumentsUploadContext';

const route = getRouteApi('/verfahren/$verfahrenId/');

export const AiProcessesStep = () => {
  const { t } = useTranslation('Project');
  const { verfahrenId } = route.useParams();
  const { close } = useDocumentsUploadContext();

  return (
    <DialogShell
      width="narrow"
      title={t('Documents.updateDocuments.aiProcesses.title')}
      closeLabel={t('Documents.updateDocuments.aiProcesses.close')}
      lockClose
      footer={
        <>
          <Button variant="ghost" size="default" onClick={close}>
            {t('Documents.updateDocuments.aiProcesses.back')}
          </Button>
          <Button variant="primary" size="default" asChild>
            <Link
              to="/verfahren/$verfahrenId/fvp/documents"
              params={{ verfahrenId }}
              search={{}}
              onClick={close}
            >
              {t('Documents.updateDocuments.aiProcesses.continueToFvp')}
            </Link>
          </Button>
        </>
      }
    >
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-14 py-10 text-center">
        <CircleCheck aria-hidden className="size-8 text-green-700" />
        <div className="flex w-[385px] max-w-full flex-col items-center gap-2">
          <span className="text-base leading-5 font-medium tracking-[-0.01em] text-green-700">
            {t('Documents.updateDocuments.aiProcesses.heading')}
          </span>
          <p className="text-[13px] leading-[18px] tracking-[-0.01em] whitespace-pre-line text-slate-600">
            {t('Documents.updateDocuments.aiProcesses.description')}
          </p>
        </div>
      </div>
    </DialogShell>
  );
};
