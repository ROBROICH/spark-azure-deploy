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
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

export type DeleteTeamMemberDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => Promise<void>;
};

export function DeleteTeamMemberDialog(props: DeleteTeamMemberDialogProps) {
  const { open, onOpenChange, onConfirm } = props;
  const { t } = useTranslation('Project');
  const [isDeleting, setIsDeleting] =
    // eslint-disable-next-line no-restricted-syntax -- ephemeral UI state for async delete button feedback
    useState(false);

  const handleConfirm = () => {
    setIsDeleting(true);
    return Promise.resolve()
      .then(() => onConfirm())
      .then(() => {
        onOpenChange(false);
      })
      .catch(() => undefined)
      .finally(() => {
        setIsDeleting(false);
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('Team.deleteDialog.title')}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <DialogDescription>
            {t('Team.deleteDialog.description')}
          </DialogDescription>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost" type="button" size="sm">
              {t('Team.deleteDialog.cancel')}
            </Button>
          </DialogClose>
          <Button
            variant="danger"
            type="button"
            loading={isDeleting}
            onClick={() => {
              void handleConfirm();
            }}
          >
            {t('Team.deleteDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
