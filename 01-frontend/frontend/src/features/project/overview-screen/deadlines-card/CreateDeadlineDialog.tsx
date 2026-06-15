import { deadlinesCollection } from '@/features/project/overview-screen/data/collections/deadlines.collection';
import {
  createDeadlineSchema,
  type DeadlineFormValues,
  defaultDeadlineValues,
} from '@/features/project/overview-screen/schemas';
import { toast } from '@/features/ui/toast/Toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';

import { DeadlineDialogForm } from './DeadlineDialogForm';

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

  const schema = createDeadlineSchema(t);

  const form = useForm<
    DeadlineFormValues,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    typeof schema,
    undefined,
    undefined,
    undefined,
    undefined,
    unknown
  >({
    defaultValues: defaultDeadlineValues,
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => {
      if (!canMutateProject) {
        onOpenChange(false);
        return;
      }

      const now = new Date().toISOString();
      deadlinesCollection.insert(
        {
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
      toast.success(t('Deadlines.createSuccess'));
      form.reset();
      onOpenChange(false);
    },
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
          labels={{
            cancel: t('Deadlines.createDialog.cancel'),
            deadlineType: t('Deadlines.form.deadlineType'),
            endAt: t('Deadlines.form.endAt'),
            legalBasis: t('Deadlines.form.legalBasis'),
            save: t('Deadlines.createDialog.save'),
            startAt: t('Deadlines.form.startAt'),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
