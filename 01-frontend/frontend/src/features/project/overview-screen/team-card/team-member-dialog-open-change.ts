type CreateTeamMemberDialogOpenChangeHandlerOptions = {
  onOpenChange: (open: boolean) => void;
  resetForm: () => void;
};

export const createTeamMemberDialogOpenChangeHandler = (
  options: CreateTeamMemberDialogOpenChangeHandlerOptions,
) => {
  const { onOpenChange, resetForm } = options;

  return (next: boolean) => {
    if (!next) {
      resetForm();
    }
    onOpenChange(next);
  };
};
