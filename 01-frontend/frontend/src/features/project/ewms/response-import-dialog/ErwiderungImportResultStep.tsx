import type { ErwiderungImportResponse } from '@/api-clients/oms-module';
import { Button } from '@/features/ui/button/Button';
import { DialogBody, DialogFooter } from '@/features/ui/dialog/Dialog';
import { cn } from '@/features/ui/style/cn';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type ErwiderungImportStatus = 'success' | 'error';

type ErwiderungImportResultStepProps = {
  importResult: ErwiderungImportResponse | null;
  status: ErwiderungImportStatus;
  onClose: () => void;
};

/** Builds counted success copy from locale fragments so i18next plural rules run before interpolation. */
export const ErwiderungImportResultStep = (
  props: ErwiderungImportResultStepProps,
) => {
  const { importResult, status, onClose } = props;
  const { t } = useTranslation('Ewms');
  const isSuccess = status === 'success' && importResult !== null;
  const successDescription = isSuccess
    ? t('responseImportDialog.successDescription', {
        skippedLabel: t('responseImportDialog.skippedCount', {
          count: importResult.skipped,
        }),
        updatedLabel: t('responseImportDialog.updatedCount', {
          count: importResult.updated,
        }),
      })
    : null;

  return (
    <>
      <DialogBody className="flex flex-col gap-4 px-5 py-6">
        <div
          className={cn(
            'flex items-start gap-3 rounded-md border px-3 py-3',
            isSuccess
              ? 'border-border-success bg-highlight-success text-text-success'
              : 'border-border-error bg-highlight-error text-text-error',
          )}
          role={isSuccess ? 'status' : 'alert'}
        >
          {isSuccess ? (
            <CheckCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-[13px] leading-[18px] font-medium">
              {isSuccess
                ? t('responseImportDialog.successTitle')
                : t('responseImportDialog.errorTitle')}
            </p>
            <p className="text-[13px] leading-[18px]">
              {successDescription ?? t('responseImportDialog.errorDescription')}
            </p>
          </div>
        </div>
      </DialogBody>

      <DialogFooter className="sm:justify-end">
        <Button type="button" variant="primary" size="sm" onClick={onClose}>
          {t('responseImportDialog.close')}
        </Button>
      </DialogFooter>
    </>
  );
};
