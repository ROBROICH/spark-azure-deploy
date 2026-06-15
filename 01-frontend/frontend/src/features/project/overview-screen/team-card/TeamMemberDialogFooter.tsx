import { Button } from '@/features/ui/button/Button';
import { DialogClose, DialogFooter } from '@/features/ui/dialog/Dialog';

type TeamMemberDialogFooterProps = {
  cancelLabel: string;
  formId: string;
  isSubmitting: boolean;
  saveLabel: string;
  submitDisabled?: boolean;
};

export function TeamMemberDialogFooter(props: TeamMemberDialogFooterProps) {
  const {
    cancelLabel,
    formId,
    isSubmitting,
    saveLabel,
    submitDisabled = false,
  } = props;

  return (
    <DialogFooter className="sticky bottom-0 z-10 shrink-0 bg-neutral-white">
      <DialogClose asChild>
        <Button variant="ghost" type="button">
          {cancelLabel}
        </Button>
      </DialogClose>
      <Button
        type="submit"
        form={formId}
        disabled={submitDisabled}
        loading={isSubmitting}
      >
        {saveLabel}
      </Button>
    </DialogFooter>
  );
}
