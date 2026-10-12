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

export type DirtyEditorNavigationDialogProps = {
  open: boolean;
  isResolving: boolean;
  onSaveAndSwitch: () => void;
  onDiscardAndSwitch: () => void;
  onCancel: () => void;
};

/** Presents the three explicit decisions for leaving a dirty editor. */
export function DirtyEditorNavigationDialog(
  props: DirtyEditorNavigationDialogProps,
) {
  const { open, isResolving, onSaveAndSwitch, onDiscardAndSwitch, onCancel } =
    props;
  const { t } = useTranslation('Administration');

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isResolving) {
          onCancel();
        }
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('dirtyNavigation.title')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription>
            {t('dirtyNavigation.description')}
          </DialogDescription>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isResolving}
            onClick={onCancel}
          >
            {t('dirtyNavigation.cancel')}
          </Button>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={isResolving}
              onClick={onDiscardAndSwitch}
            >
              {t('dirtyNavigation.discardAndSwitch')}
            </Button>
            <Button
              type="button"
              size="sm"
              loading={isResolving}
              onClick={onSaveAndSwitch}
            >
              {t('dirtyNavigation.saveAndSwitch')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
