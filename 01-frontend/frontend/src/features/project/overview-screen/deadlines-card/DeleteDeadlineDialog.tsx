import { Button } from '@/features/ui/button/Button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { useTranslation } from 'react-i18next';

export type DeleteDeadlineDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};
export function DeleteDeadlineDialog(props: DeleteDeadlineDialogProps) {
  const { open, onOpenChange, onConfirm } = props;
  const { t } = useTranslation('Project');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('Deadlines.deleteDialog.title')}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <DialogDescription>
            {t('Deadlines.deleteDialog.description')}
          </DialogDescription>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button" size="sm">
              {t('Deadlines.deleteDialog.cancel')}
            </Button>
          </DialogClose>
          <Button
            variant="danger"
            type="button"
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {t('Deadlines.deleteDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
