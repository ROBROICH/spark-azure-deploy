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

export type DecisionTemplateNameDialogKind = 'addChild' | 'addRoot';

export type DecisionTemplateNameDialogProps = {
  kind: DecisionTemplateNameDialogKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitTitle: (title: string) => void;
};

const TITLE_KEY = {
  addChild: 'decisionTemplate.dialogs.addChildTitle',
  addRoot: 'decisionTemplate.dialogs.addRootTitle',
} as const satisfies Record<DecisionTemplateNameDialogKind, string>;

const FORM_ID = {
  addChild: 'add-decision-child-form',
  addRoot: 'add-decision-root-form',
} as const satisfies Record<DecisionTemplateNameDialogKind, string>;

/**
 * Collects a required title for a new Beschluss template node.
 *
 * @param props Dialog kind, open state, and the title callback.
 * @returns The add-node title dialog.
 */
export function DecisionTemplateNameDialog(
  props: DecisionTemplateNameDialogProps,
) {
  const { kind, open, onOpenChange, onSubmitTitle } = props;
  const { t } = useTranslation('Administration');
  const schema = z.object({
    title: z.string().trim().min(1, t('decisionTemplate.errors.titleRequired')),
  });
  const formId = FORM_ID[kind];
  const titleId = `${formId}-title`;
  const errorId = `${formId}-title-error`;

  const form = useForm({
    defaultValues: { title: '' },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => {
      onSubmitTitle(value.title.trim());
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
            id={formId}
            onSubmit={(event) => {
              event.preventDefault();
              void form.handleSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <form.Field name="title">
              {(field) => {
                const isInvalid = field.state.meta.errors.length > 0;
                return (
                  <Field data-invalid={isInvalid || undefined}>
                    <FieldLabel htmlFor={titleId}>
                      {t('decisionTemplate.fields.title')}*
                    </FieldLabel>
                    <Input
                      id={titleId}
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
              {t('decisionTemplate.dialogs.cancel')}
            </Button>
          </DialogClose>
          <Button type="submit" form={formId}>
            {t('decisionTemplate.dialogs.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
