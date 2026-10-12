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
  createCatalogNameSchema,
  type CatalogNameFormValues,
} from './catalogNameForm.schema';

export type CatalogNameDialogKind = 'topic' | 'subtopic';

export type CatalogNameDialogProps = {
  kind: CatalogNameDialogKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitName: (name: string) => void;
};

const TITLE_KEY = {
  topic: 'catalog.dialogs.addTopic.title',
  subtopic: 'catalog.dialogs.addSubtopic.title',
} as const satisfies Record<CatalogNameDialogKind, string>;

const NAME_KEY = {
  topic: 'catalog.fields.name',
  subtopic: 'catalog.fields.name',
} as const satisfies Record<CatalogNameDialogKind, string>;

const FORM_ID = {
  topic: 'add-catalog-topic-form',
  subtopic: 'add-catalog-subtopic-form',
} as const satisfies Record<CatalogNameDialogKind, string>;

/**
 * Collects a required unique-enough name for a new topic or subtopic.
 * Duplicate checks run in the draft reducer after submit.
 *
 * @param props Dialog kind, open state, and the name callback.
 * @returns The add-name dialog.
 */
export function CatalogNameDialog(props: CatalogNameDialogProps) {
  const { kind, open, onOpenChange, onSubmitName } = props;
  const { t } = useTranslation('Administration');
  const schema = createCatalogNameSchema(t);

  const form = useForm({
    defaultValues: { name: '' } satisfies CatalogNameFormValues,
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent showCloseButton aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t(TITLE_KEY[kind])}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <form
            id={FORM_ID[kind]}
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <form.Field name="name">
              {(field) => {
                const isInvalid = field.state.meta.errors.length > 0;
                const errorId = `${FORM_ID[kind]}-name-error`;
                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor={`${FORM_ID[kind]}-name`}>
                      {t(NAME_KEY[kind])}*
                    </FieldLabel>
                    <Input
                      id={`${FORM_ID[kind]}-name`}
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
              {t('catalog.dialogs.cancel')}
            </Button>
          </DialogClose>
          <Button type="submit" form={FORM_ID[kind]}>
            {t('catalog.dialogs.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
