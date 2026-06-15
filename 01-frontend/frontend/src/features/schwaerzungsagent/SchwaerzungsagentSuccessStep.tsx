import { Alert, AlertDescription } from '@/features/ui/alert/Alert';
import { Button } from '@/features/ui/button/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { CircleCheck, Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type SchwaerzungsagentSuccessStepProps = {
  downloadError: Error | null;
  filename: string;
  isDownloadLoading: boolean;
  objectUrl: string | null;
  onNewFile: () => void;
  onRetryDownload: () => void;
};

const createDownload = (props: { filename: string; objectUrl: string }) => {
  const link = document.createElement('a');

  link.href = props.objectUrl;
  link.download = props.filename;
  link.click();
};

export const SchwaerzungsagentSuccessStep = (
  props: SchwaerzungsagentSuccessStepProps,
) => {
  const {
    downloadError,
    filename,
    isDownloadLoading,
    objectUrl,
    onNewFile,
    onRetryDownload,
  } = props;
  const { t } = useTranslation('Schwaerzungsagent');
  // eslint-disable-next-line no-restricted-syntax -- local dialog open state
  const [confirmOpen, setConfirmOpen] = useState(false);

  const handleDownload = () => {
    if (!objectUrl) {
      return;
    }

    createDownload({ filename, objectUrl });
  };

  const handleConfirmNewFile = () => {
    setConfirmOpen(false);
    onNewFile();
  };

  return (
    <>
      <div className="mt-4 w-full rounded-lg bg-success-50 px-8 py-10">
        <div className="flex w-full flex-col items-center text-center">
          <CircleCheck className="size-8 text-success-900" aria-hidden />

          <div
            className="mt-5 flex flex-col items-center gap-1"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <p className="text-base leading-6 font-medium text-success-900">
              {t('success.heading')}
            </p>
            <p className="text-[13px] leading-[18px] text-success-900">
              {t('success.description', { filename })}
            </p>
          </div>

          {downloadError ? (
            <Alert
              variant="destructive"
              className="mt-4 flex w-auto flex-col items-center gap-2 rounded-md border-border-error bg-highlight-error px-3 py-2 text-[13px] leading-[18px] text-text-error"
            >
              <AlertDescription className="col-auto text-[13px] leading-[18px] text-text-error">
                <p>{t('success.downloadError')}</p>
              </AlertDescription>
              <Button
                type="button"
                variant="secondary"
                size="xs"
                onClick={onRetryDownload}
              >
                {t('success.retryDownload')}
              </Button>
            </Alert>
          ) : null}

          <div className="mt-6 flex flex-col items-center gap-2">
            {isDownloadLoading ? (
              <p role="status" className="sr-only">
                {t('success.downloadPreparing')}
              </p>
            ) : null}
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleDownload}
              withIcon
              loading={isDownloadLoading}
              disabled={!objectUrl || Boolean(downloadError)}
            >
              <Download aria-hidden />
              {t('success.download')}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmOpen(true)}
            >
              {t('success.newFile')}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('success.confirmDialog.title')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <DialogDescription>
              {t('success.confirmDialog.body')}
            </DialogDescription>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmOpen(false)}
            >
              {t('success.confirmDialog.cancel')}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleConfirmNewFile}
            >
              {t('success.confirmDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
