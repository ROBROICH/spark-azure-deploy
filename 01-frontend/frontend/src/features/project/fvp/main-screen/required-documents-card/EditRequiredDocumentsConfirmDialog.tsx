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
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type EditRequiredDocumentsConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export const EditRequiredDocumentsConfirmDialog = (
  props: EditRequiredDocumentsConfirmDialogProps,
) => {
  const { t } = useTranslation('FormalCompletenessCheck');
  const { open, onOpenChange, onCancel, onConfirm } = props;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader className="justify-center text-center">
          <DialogTitle className="min-w-0 text-center whitespace-normal">
            {t('EditRequiredDocumentsDialog.confirmSaveTitle')}
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          <DialogDescription className="text-sm leading-5 text-text-secondary">
            {t('EditRequiredDocumentsDialog.confirmSaveDescription')}
          </DialogDescription>

          <div className="flex gap-3 rounded-[8px] border border-border-primary bg-slate-50 p-4">
            <Info
              className="size-5 shrink-0 text-brand-950"
              aria-hidden="true"
            />
            <div>
              <p className="text-sm leading-5 font-medium text-text-primary">
                {t('EditRequiredDocumentsDialog.hintTitle')}
              </p>
              <p className="text-[13px] leading-[18px] text-text-secondary">
                {t('EditRequiredDocumentsDialog.hintDescription')}
              </p>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {t('EditRequiredDocumentsDialog.cancel')}
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm}>
            {t('EditRequiredDocumentsDialog.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
