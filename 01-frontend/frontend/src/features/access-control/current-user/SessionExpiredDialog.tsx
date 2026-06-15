import { Button } from '@/features/ui/button/Button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

function reloadPage(): void {
  window.location.reload();
}

type SessionExpiredDialogProps = {
  open: boolean;
};

export function SessionExpiredDialog(
  props: SessionExpiredDialogProps,
): ReactElement | null {
  const { open } = props;
  const { t } = useTranslation('shared');

  if (!open) {
    return null;
  }

  return (
    <Dialog open={true}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onEscapeKeyDown={(event) => {
          event.preventDefault();
        }}
        onInteractOutside={(event) => {
          event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('sessionExpiredDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogDescription className="px-4 pt-4 text-base leading-6 text-text-secondary">
          {t('sessionExpiredDialog.description')}
        </DialogDescription>
        <DialogFooter className="px-4 pt-2 pb-4">
          <Button type="button" size="lg" onClick={reloadPage}>
            {t('sessionExpiredDialog.reload')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
