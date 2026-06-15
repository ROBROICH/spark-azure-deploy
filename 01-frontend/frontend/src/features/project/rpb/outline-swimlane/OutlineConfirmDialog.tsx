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

type OutlineConfirmDialogProps = {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Confirmation dialog shown before marking (or unmarking) an outline node as
 * checked. Copy is supplied by the caller because it varies per role.
 */
export const OutlineConfirmDialog = (props: OutlineConfirmDialogProps) => {
  const { open, title, body, confirmLabel, cancelLabel, onConfirm, onCancel } =
    props;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onCancel();
        }
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader className="justify-center">
          <DialogTitle className="flex-none">{title}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription className="text-sm text-text-secondary">
            {body}
          </DialogDescription>
        </DialogBody>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button type="button" variant="primary" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
