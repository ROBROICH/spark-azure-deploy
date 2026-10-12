import type { ProjectTypeResponse } from '@/api-clients/backend';
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

import { AdministrationDeleteButton } from '../AdministrationDeleteButton';

export type DeleteProjectTypeDialogProps = {
  projectType: ProjectTypeResponse | null;
  conflict: boolean;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onDeactivateInstead: () => void;
};

export function DeleteProjectTypeDialog(props: DeleteProjectTypeDialogProps) {
  const {
    projectType,
    conflict,
    isPending,
    onOpenChange,
    onConfirm,
    onDeactivateInstead,
  } = props;
  const { t } = useTranslation('Administration');
  const name = projectType?.name ?? '';

  const handleOpenChange = (open: boolean) => {
    if (!open && isPending) {
      return;
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={projectType !== null} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {conflict
              ? t('projectTypes.deleteDialog.conflictTitle')
              : t('projectTypes.deleteDialog.title')}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            {conflict
              ? t('projectTypes.deleteDialog.conflictDescription', { name })
              : t('projectTypes.deleteDialog.description', { name })}
          </DialogDescription>
        </DialogBody>
        <DialogFooter>
          <DialogClose asChild>
            <Button
              variant="ghost"
              type="button"
              size="sm"
              disabled={isPending}
            >
              {t('projectTypes.deleteDialog.cancel')}
            </Button>
          </DialogClose>
          {conflict ? (
            <Button
              type="button"
              onClick={onDeactivateInstead}
              loading={isPending}
            >
              {t('projectTypes.deleteDialog.deactivateInstead')}
            </Button>
          ) : (
            <AdministrationDeleteButton
              aria-label={t('projectTypes.deleteDialog.confirm')}
              onConfirm={onConfirm}
              loading={isPending}
            >
              {t('projectTypes.deleteDialog.confirm')}
            </AdministrationDeleteButton>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
