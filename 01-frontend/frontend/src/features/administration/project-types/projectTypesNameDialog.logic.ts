import type { ProjectTypeResponse } from '@/api-clients/backend';

type NameDialogMode = 'create' | 'rename' | 'duplicate';

type ProjectTypesNameDialogOwner =
  | { type: 'closed' }
  | { type: 'create' }
  | { type: 'rename'; projectType: ProjectTypeResponse }
  | { type: 'duplicate'; projectType: ProjectTypeResponse }
  | { type: 'delete'; projectType: ProjectTypeResponse; conflict: boolean };

export type ProjectTypesNameDialogState = {
  mode: NameDialogMode;
  initialName: string;
  remountKey: string;
};

export const resolveProjectTypesNameDialog = (
  dialog: ProjectTypesNameDialogOwner,
  duplicateName: (name: string) => string,
): ProjectTypesNameDialogState | null => {
  if (dialog.type === 'create') {
    return {
      mode: 'create',
      initialName: '',
      remountKey: 'create-project-type',
    };
  }

  if (dialog.type === 'rename') {
    return {
      mode: 'rename',
      initialName: dialog.projectType.name,
      remountKey: `rename-${dialog.projectType.id}`,
    };
  }

  if (dialog.type === 'duplicate') {
    return {
      mode: 'duplicate',
      initialName: duplicateName(dialog.projectType.name),
      remountKey: `duplicate-${dialog.projectType.id}`,
    };
  }

  return null;
};
