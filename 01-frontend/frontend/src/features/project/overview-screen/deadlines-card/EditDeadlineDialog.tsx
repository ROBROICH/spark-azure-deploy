import { type DeadlineResponse } from '@/api-clients/pls-module';
import { deadlinesCollection } from '@/features/project/overview-screen/data/collections/deadlines.collection';
import {
  createDeadlineSchema,
  type DeadlineFormValues,
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

export type EditDeadlineDialogProps = {
  canMutateProject: boolean;
  deadline: DeadlineResponse | null;
  onOpenChange: (open: boolean) => void;
};

/** Pre-populates form with existing deadline values and patches the collection on submit. */
export function EditDeadlineDialog(props: EditDeadlineDialogProps) {
  const { canMutateProject, deadline, onOpenChange } = props;
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
    defaultValues: {
      deadlineType: deadline?.deadlineType ?? '',
      startAt: deadline?.startAt.split('T')[0] ?? '',
      endAt: deadline?.endAt.split('T')[0] ?? '',
      legalBasis: deadline?.legalBasis ?? '',
    },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => {
      if (!deadline || !canMutateProject) {
        onOpenChange(false);
        return;
      }
      deadlinesCollection.update(deadline.id, (draft) => {
        Object.assign(draft, {
          deadlineType: value.deadlineType.trim(),
          startAt: value.startAt.trim(),
          endAt: value.endAt.trim(),
          legalBasis: value.legalBasis.trim() || null,
        });
      });
      toast.success(t('Deadlines.updateSuccess'));
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
    <Dialog open={deadline !== null} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle>{t('Deadlines.editDialog.title')}</DialogTitle>
        </DialogHeader>
        <DeadlineDialogForm
          form={form}
          formId="edit-deadline-form"
          labels={{
            cancel: t('Deadlines.editDialog.cancel'),
            deadlineType: t('Deadlines.form.deadlineType'),
            endAt: t('Deadlines.form.endAt'),
            legalBasis: t('Deadlines.form.legalBasis'),
            save: t('Deadlines.editDialog.save'),
            startAt: t('Deadlines.form.startAt'),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
