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
import { z } from 'zod';

export type RequiredDocumentsNameDialogKind =
  | 'addCategory'
  | 'renameCategory'
  | 'addDocumentType';

export type RequiredDocumentsNameDialogProps = {
  kind: RequiredDocumentsNameDialogKind;
  open: boolean;
  initialName: string;
  onOpenChange: (open: boolean) => void;
  onSubmitName: (name: string) => void;
};

const TITLE_KEY = {
  addCategory: 'requiredDocuments.dialogs.addCategoryTitle',
  renameCategory: 'requiredDocuments.dialogs.renameCategoryTitle',
  addDocumentType: 'requiredDocuments.dialogs.addDocumentTypeTitle',
} as const satisfies Record<RequiredDocumentsNameDialogKind, string>;

const NAME_KEY = {
  addCategory: 'requiredDocuments.fields.categoryName',
  renameCategory: 'requiredDocuments.fields.categoryName',
  addDocumentType: 'catalog.fields.name',
} as const satisfies Record<RequiredDocumentsNameDialogKind, string>;

const SUBMIT_KEY = {
  addCategory: 'requiredDocuments.dialogs.add',
  renameCategory: 'requiredDocuments.dialogs.save',
  addDocumentType: 'requiredDocuments.dialogs.add',
} as const satisfies Record<RequiredDocumentsNameDialogKind, string>;

const FORM_ID = {
  addCategory: 'add-required-document-category-form',
  renameCategory: 'rename-required-document-category-form',
  addDocumentType: 'add-required-document-type-form',
} as const satisfies Record<RequiredDocumentsNameDialogKind, string>;

/**
 * Collects a required name for adding or renaming a category, or adding a
 * document type. Duplicate-name checks run in the draft reducer after submit.
 *
 * @param props Dialog kind, current name, open state, and the name callback.
 * @returns The required-documents name dialog.
 */
export function RequiredDocumentsNameDialog(
  props: RequiredDocumentsNameDialogProps,
) {
  const { kind, open, initialName, onOpenChange, onSubmitName } = props;
  const { t } = useTranslation('Administration');
  const schema = z.object({
    name: z.string().trim().min(1, t('catalog.form.nameRequired')),
  });

  const form = useForm({
    defaultValues: { name: initialName },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => {
      onSubmitName(value.name.trim());
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

  const formId = FORM_ID[kind];
  const nameId = `${formId}-name`;
  const errorId = `${formId}-name-error`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t(TITLE_KEY[kind])}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <form.Field name="name">
              {(field) => {
                const isInvalid = field.state.meta.errors.length > 0;
                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor={nameId}>
                      {t(NAME_KEY[kind])}*
                    </FieldLabel>
                    <Input
                      id={nameId}
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
          <DialogClose asChild>
            <Button variant="ghost" type="button">
              {t('requiredDocuments.dialogs.cancel')}
            </Button>
          </DialogClose>
          <Button type="submit" form={formId}>
            {t(SUBMIT_KEY[kind])}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
