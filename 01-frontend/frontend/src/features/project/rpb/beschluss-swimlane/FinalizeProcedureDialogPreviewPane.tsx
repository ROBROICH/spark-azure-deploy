import { SafePdfIframe } from '@/features/shared/remote-files/SafePdfIframe';
import type { LocalPdfPreviewUrlString } from '@/features/shared/remote-files/downloadUrlSafety';
import { Alert, AlertDescription, AlertTitle } from '@/features/ui/alert/Alert';
import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type FinalizeProcedureDialogPreviewPaneProps = {
  hasPreviewError: boolean;
  isPreviewLoading: boolean;
  previewUrl: LocalPdfPreviewUrlString | null;
};

export const FinalizeProcedureDialogPreviewPane = (
  props: FinalizeProcedureDialogPreviewPaneProps,
) => {
  const { hasPreviewError, isPreviewLoading, previewUrl } = props;
  const { t } = useTranslation('Rpb');

  return (
    <div className="min-h-[24rem] overflow-hidden rounded-[20px] border border-border-primary bg-white">
      {isPreviewLoading ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm text-neutral-600">
          {t('shared:app.loading')}
        </div>
      ) : hasPreviewError ? (
        <div className="flex h-full items-center justify-center p-4">
          <Alert variant="destructive" className="max-w-md">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>{t('finalize.previewErrorTitle')}</AlertTitle>
            <AlertDescription>
              {t('finalize.previewErrorBody')}
            </AlertDescription>
          </Alert>
        </div>
      ) : previewUrl ? (
        <SafePdfIframe
          title={t('finalize.previewTitle')}
          src={previewUrl}
          className="h-full w-full bg-white"
        />
      ) : null}
    </div>
  );
};
