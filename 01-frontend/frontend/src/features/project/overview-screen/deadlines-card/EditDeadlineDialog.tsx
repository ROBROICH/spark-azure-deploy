import {
  v1ProjectLogicUpdateDeadline,
  type DeadlineResponse,
} from '@/api-clients/backend';
import { invalidateDeadlineReads } from '@/features/project/overview-screen/data/collections/deadlines.collection';
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

export type EditDeadlineDialogProps = {
  canMutateProject: boolean;
  deadline: DeadlineResponse | null;
  onOpenChange: (open: boolean) => void;
};

/** Keeps unsaved deadline edits open until the server accepts them. */
export function EditDeadlineDialog(props: EditDeadlineDialogProps) {
  const { canMutateProject, deadline, onOpenChange } = props;
  const { t } = useTranslation('Project');
  const form = useDeadlineDialogForm(
    {
      deadlineType: deadline?.deadlineType ?? '',
      startAt: deadline?.startAt.split('T')[0] ?? '',
      endAt: deadline?.endAt.split('T')[0] ?? '',
      legalBasis: deadline?.legalBasis ?? '',
    },
    async (value) => {
      if (!deadline || !canMutateProject) {
        onOpenChange(false);
        return;
      }
      try {
        await v1ProjectLogicUpdateDeadline({
          path: { deadlineId: deadline.id },
          body: {
            deadlineType: value.deadlineType.trim(),
            startAt: value.startAt.trim(),
            endAt: value.endAt.trim(),
            legalBasis: value.legalBasis.trim() || null,
          },
          throwOnError: true,
        });
        await invalidateDeadlineReads();
      } catch (error) {
        // Keep the dialog open with the unsaved edit so the user can retry.
        Sentry.captureException(error);
        toast.error(t('Deadlines.updateError'));
        return;
      }

      toast.success(t('Deadlines.updateSuccess'));
      onOpenChange(false);
    },
  );

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
          mode="edit"
        />
      </DialogContent>
    </Dialog>
  );
}
