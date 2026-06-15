import { Alert, AlertDescription, AlertTitle } from '@/features/ui/alert/Alert';
import { AlertCircle, FileText, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type FinalizeProcedureDialogInfoRailProps = {
  downloadErrorFormat: 'pdf' | 'docx' | null;
};

export const FinalizeProcedureDialogInfoRail = (
  props: FinalizeProcedureDialogInfoRailProps,
) => {
  const { downloadErrorFormat } = props;
  const { t } = useTranslation('Rpb');

  return (
    <div className="flex flex-col gap-4 rounded-[20px] border border-border-primary bg-slate-50 p-5">
      <div className="flex size-12 items-center justify-center rounded-2xl bg-brand-950 text-white">
        <Info className="size-5" aria-hidden="true" />
      </div>

      <div className="space-y-3">
        <h2 className="text-lg leading-6 font-medium tracking-[-0.02em] text-brand-950">
          {t('finalize.infoTitle')}
        </h2>
        <p className="text-sm leading-6 text-neutral-700">
          {t('finalize.infoBody')}
        </p>
        <p className="text-sm leading-6 font-medium text-neutral-900">
          {t('finalize.infoNote')}
        </p>
      </div>

      <div className="rounded-2xl border border-border-primary bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
            <FileText className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-neutral-900">
              {t('finalize.downloadCardTitle')}
            </p>
            <p className="text-xs leading-5 text-neutral-600">
              {t('finalize.downloadCardBody')}
            </p>
          </div>
        </div>
      </div>

      {downloadErrorFormat ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{t('finalize.downloadErrorTitle')}</AlertTitle>
          <AlertDescription>
            {t(
              downloadErrorFormat === 'pdf'
                ? 'finalize.downloadPdfErrorBody'
                : 'finalize.downloadDocxErrorBody',
            )}
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
};
