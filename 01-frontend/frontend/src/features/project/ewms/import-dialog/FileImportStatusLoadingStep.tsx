import { DialogBody } from '@/features/ui/dialog/Dialog';
import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const FileImportStatusLoadingStep = () => {
  const { t } = useTranslation('Ewms');

  return (
    <DialogBody className="flex min-h-[260px] items-center justify-center px-8 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <LoaderCircle
          className="size-10 animate-spin text-brand-950"
          aria-hidden
        />

        <p className="text-base leading-6 font-medium text-text-primary">
          {t('importDialog.statusLoadingTitle')}
        </p>
      </div>
    </DialogBody>
  );
};
