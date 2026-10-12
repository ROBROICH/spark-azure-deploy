import { deadlinesCollection } from '@/features/project/overview-screen/data/collections/deadlines.collection';
import { defaultDeadlineValues } from '@/features/project/overview-screen/schemas';
import { toast } from '@/features/ui/toast/Toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import * as Sentry from '@sentry/react';
import { useTranslation } from 'react-i18next';

import {
  DeadlineDialogForm,
  useDeadlineDialogForm,
} from './DeadlineDialogForm';

export type CreateDeadlineDialogProps = {
  canMutateProject: boolean;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Validates and inserts a new deadline into the collection on submit; resets form on close. */
export function CreateDeadlineDialog(props: CreateDeadlineDialogProps) {
  const { canMutateProject, projectId, open, onOpenChange } = props;
  const { t } = useTranslation('Project');

  const form = useDeadlineDialogForm(defaultDeadlineValues, async (value) => {
    if (!canMutateProject) {
      onOpenChange(false);
      return;
    }

    const now = new Date().toISOString();
    const transaction = deadlinesCollection.insert(
      {
        // Local collection key only; the server assigns the real id and the
        // create payload deliberately omits this field.
        id: crypto.randomUUID(),
        projectId,
        deadlineType: value.deadlineType.trim(),
        startAt: value.startAt.trim(),
        endAt: value.endAt.trim(),
        legalBasis: value.legalBasis.trim() || null,
        createdAt: now,
        updatedAt: now,
      },
      {
        optimistic: false,
      },
    );

    try {
      await transaction.isPersisted.promise;
    } catch (error) {
      // Keep the dialog open with the unsaved draft so the user can retry.
      Sentry.captureException(error);
      toast.error(t('Deadlines.createError'));
      return;
    }

    toast.success(t('Deadlines.createSuccess'));
    form.reset();
    onOpenChange(false);
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>{t('Deadlines.createDialog.title')}</DialogTitle>
        </DialogHeader>
        <DeadlineDialogForm
          form={form}
          formId="create-deadline-form"
          mode="create"
        />
      </DialogContent>
    </Dialog>
  );
}
