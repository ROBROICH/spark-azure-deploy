import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

export function FeedbackDialogFrame(props: {
  ariaBusy?: boolean;
  children: ReactNode;
  descriptionKey: string;
  namespace: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const { ariaBusy, children, descriptionKey, namespace, onOpenChange, open } =
    props;
  const { t } = useTranslation(namespace);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton aria-busy={ariaBusy}>
        <DialogHeader>
          <DialogTitle>{t('FeedbackDialog.title')}</DialogTitle>
          <DialogDescription className="sr-only">
            {t(descriptionKey)}
          </DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
