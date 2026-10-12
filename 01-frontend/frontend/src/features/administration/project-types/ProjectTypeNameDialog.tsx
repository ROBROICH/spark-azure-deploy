import { getProjectTypeApiErrorMessage } from '@/features/project/data/project-types/projectTypeMutationError';
import { Button } from '@/features/ui/button/Button';
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { Field, FieldError, FieldLabel } from '@/features/ui/form/field';
import { Input } from '@/features/ui/input/Input';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';

import {
  createProjectTypeNameSchema,
  type ProjectTypeNameFormValues,
} from './projectTypeNameForm.schema';

type ProjectTypeNameDialogMode = 'create' | 'rename' | 'duplicate';

export type ProjectTypeNameDialogProps = {
  mode: ProjectTypeNameDialogMode;
  open: boolean;
  initialName: string;
  onOpenChange: (open: boolean) => void;
  onPersist: (name: string) => Promise<void>;
};

const TITLE_KEY = {
  create: 'projectTypes.createDialog.title',
  rename: 'projectTypes.renameDialog.title',
  duplicate: 'projectTypes.duplicateDialog.title',
} as const satisfies Record<ProjectTypeNameDialogMode, string>;

const SAVE_KEY = {
  create: 'projectTypes.createDialog.save',
  rename: 'projectTypes.renameDialog.save',
  duplicate: 'projectTypes.duplicateDialog.save',
} as const satisfies Record<ProjectTypeNameDialogMode, string>;

const CANCEL_KEY = {
  create: 'projectTypes.createDialog.cancel',
  rename: 'projectTypes.renameDialog.cancel',
  duplicate: 'projectTypes.duplicateDialog.cancel',
} as const satisfies Record<ProjectTypeNameDialogMode, string>;

const NAME_KEY = {
  create: 'projectTypes.createDialog.name',
  rename: 'projectTypes.renameDialog.name',
  duplicate: 'projectTypes.duplicateDialog.name',
} as const satisfies Record<ProjectTypeNameDialogMode, string>;

const FORM_ID = {
  create: 'create-project-type-form',
  rename: 'rename-project-type-form',
  duplicate: 'duplicate-project-type-form',
} as const satisfies Record<ProjectTypeNameDialogMode, string>;

type ProjectTypeNameFormApi = {
  reset: () => void;
  setErrorMap: (errorMap: {
    onSubmit: { fields: { name: { message: string } } };
  }) => void;
};

/**
 * Persists a create/rename name and maps uniqueness conflicts onto the field.
 *
 * @param options Trimmed name, persist callback, form API, and close handler.
 * @returns Resolves after persist or after a field-level API error is applied.
 */
const persistProjectTypeName = async (options: {
  name: string;
  persist: (name: string) => Promise<void>;
  form: ProjectTypeNameFormApi;
  onOpenChange: (open: boolean) => void;
}): Promise<void> => {
  try {
    await options.persist(options.name);
    options.form.reset();
    options.onOpenChange(false);
  } catch (error) {
    const message = getProjectTypeApiErrorMessage(error);
    if (!message) {
      return;
    }
    options.form.setErrorMap({
      onSubmit: {
        fields: {
          name: { message },
        },
      },
    });
  }
};

/**
 * Create/rename/duplicate dialog for a project type name. Client-side empty-name
 * validation stays in the form; API uniqueness conflicts are written back
 * onto the name field without closing the dialog.
 *
 * @param props Dialog mode, current name, open state, and the persist callback.
 * @returns The name dialog for creating or renaming one project type.
 */
export function ProjectTypeNameDialog(props: ProjectTypeNameDialogProps) {
  const { mode, open, initialName, onOpenChange, onPersist } = props;
  const { t } = useTranslation('Administration');
  const schema = createProjectTypeNameSchema(t);

  const form = useForm({
    defaultValues: { name: initialName } satisfies ProjectTypeNameFormValues,
    validators: { onSubmit: schema },
    onSubmit: ({ value }) =>
      persistProjectTypeName({
        name: value.name.trim(),
        persist: onPersist,
        form,
        onOpenChange,
      }),
  });

  const handleOpenChange = (next: boolean) => {
    if (!next && form.state.isSubmitting) {
      return;
    }
    if (!next) {
      form.reset();
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t(TITLE_KEY[mode])}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form
            id={FORM_ID[mode]}
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <form.Field name="name">
              {(field) => {
                const isInvalid = field.state.meta.errors.length > 0;
                const errorId = `${field.name}-error`;
                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor={field.name}>
                      {t(NAME_KEY[mode])}*
                    </FieldLabel>
                    <Input
                      id={field.name}
                      name={field.name}
                      value={field.state.value}
                      onBlur={field.handleBlur}
                      onChange={(event) =>
                        field.handleChange(event.target.value)
                      }
                      aria-required
                      aria-invalid={isInvalid}
                      aria-describedby={isInvalid ? errorId : undefined}
                    />
                    {isInvalid ? (
                      <FieldError
                        id={errorId}
                        errors={field.state.meta.errors}
                      />
                    ) : null}
                  </Field>
                );
              }}
            </form.Field>
          </form>
        </DialogBody>
        <DialogFooter>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <>
                <DialogClose asChild>
                  <Button variant="ghost" type="button" disabled={isSubmitting}>
                    {t(CANCEL_KEY[mode])}
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  form={FORM_ID[mode]}
                  loading={isSubmitting}
                >
                  {t(SAVE_KEY[mode])}
                </Button>
              </>
            )}
          </form.Subscribe>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
