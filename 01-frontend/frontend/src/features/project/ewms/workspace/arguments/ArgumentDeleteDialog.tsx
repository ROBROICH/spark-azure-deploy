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
import { useTranslation } from 'react-i18next';

type ArgumentDeleteDialogProps = {
  canDelete: boolean;
  isOpen: boolean;
  referenceId: string;
  onConfirm: () => void;
  onOpenChange: (isOpen: boolean) => void;
};

export const ArgumentDeleteDialog = (props: ArgumentDeleteDialogProps) => {
  const { canDelete, isOpen, referenceId, onConfirm, onOpenChange } = props;
  const { t } = useTranslation('Ewms');

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>{t('arguments.deleteDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription className="text-sm text-text-secondary">
            {t('arguments.deleteDialog.description', { referenceId })}
          </DialogDescription>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            {t('arguments.deleteDialog.cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={!canDelete}
            onClick={onConfirm}
          >
            {t('arguments.deleteDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
