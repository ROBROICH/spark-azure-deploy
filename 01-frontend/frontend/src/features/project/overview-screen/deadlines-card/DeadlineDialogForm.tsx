import {
  createDeadlineSchema,
  type DeadlineFormValues,
} from '@/features/project/overview-screen/schemas';
import { Field, FieldError, FieldLabel } from '@/features/ui/form/field';
import { Input } from '@/features/ui/input/Input';
import { Button } from '@/features/ui/button/Button';
import {
  DialogBody,
  DialogClose,
  DialogFooter,
} from '@/features/ui/dialog/Dialog';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';

export function useDeadlineDialogForm(
  defaultValues: DeadlineFormValues,
  submitDeadline: (value: DeadlineFormValues) => Promise<void>,
) {
  const { t } = useTranslation('Project');
  return useForm({
    defaultValues,
    validators: { onSubmit: createDeadlineSchema(t) },
    onSubmit: async ({ value }) => submitDeadline(value),
  });
}

type DeadlineDialogFormProps = {
  form: ReturnType<typeof useDeadlineDialogForm>;
  formId: string;
  mode: 'create' | 'edit';
};

/**
 * Keeps validation announcements tied to fields in this dialog instance.
 * @param props - Form state, dialog identity, and create or edit mode.
 * @returns Deadline fields and actions with scoped error descriptions.
 */
export function DeadlineDialogForm(props: DeadlineDialogFormProps) {
  const { form, formId, mode } = props;
  const { t } = useTranslation('Project');

  return (
    <>
      <DialogBody>
        <form
          id={formId}
          onSubmit={(e) => {
            e.preventDefault();
            form.handleSubmit();
          }}
          className="flex flex-col gap-4"
        >
          <form.Field name="deadlineType">
            {(field) => {
              const isInvalid = field.state.meta.errors.length > 0;
              const errorId = `${formId}-${field.name}-error`;
              return (
                <Field data-invalid={isInvalid || undefined}>
                  <FieldLabel htmlFor={field.name}>
                    {t('Deadlines.form.deadlineType')}*
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-required
                    aria-invalid={isInvalid}
                    aria-describedby={isInvalid ? errorId : undefined}
                  />
                  {isInvalid && (
                    <FieldError id={errorId} errors={field.state.meta.errors} />
                  )}
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="startAt">
            {(field) => {
              const isInvalid = field.state.meta.errors.length > 0;
              const errorId = `${formId}-${field.name}-error`;
              return (
                <Field data-invalid={isInvalid || undefined}>
                  <FieldLabel htmlFor={field.name}>
                    {t('Deadlines.form.startAt')}*
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="date"
                    max="9999-12-31"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-required
                    aria-invalid={isInvalid}
                    aria-describedby={isInvalid ? errorId : undefined}
                  />
                  {isInvalid && (
                    <FieldError id={errorId} errors={field.state.meta.errors} />
                  )}
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="endAt">
            {(field) => (
              <form.Subscribe selector={(state) => state.values.startAt}>
                {(startAt) => {
                  const isInvalid = field.state.meta.errors.length > 0;
                  const errorId = `${formId}-${field.name}-error`;
                  return (
                    <Field data-invalid={isInvalid || undefined}>
                      <FieldLabel htmlFor={field.name}>
                        {t('Deadlines.form.endAt')}*
                      </FieldLabel>
                      <Input
                        id={field.name}
                        name={field.name}
                        type="date"
                        min={startAt || undefined}
                        max="9999-12-31"
                        value={field.state.value}
                        onBlur={field.handleBlur}
                        onChange={(e) => field.handleChange(e.target.value)}
                        aria-required
                        aria-invalid={isInvalid}
                        aria-describedby={isInvalid ? errorId : undefined}
                      />
                      {isInvalid && (
                        <FieldError
                          id={errorId}
                          errors={field.state.meta.errors}
                        />
                      )}
                    </Field>
                  );
                }}
              </form.Subscribe>
            )}
          </form.Field>
          <form.Field name="legalBasis">
            {(field) => (
              <Field>
                <FieldLabel htmlFor={field.name}>
                  {t('Deadlines.form.legalBasis')}
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                />
              </Field>
            )}
          </form.Field>
        </form>
      </DialogBody>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost" type="button">
            {t(`Deadlines.${mode}Dialog.cancel`)}
          </Button>
        </DialogClose>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button type="submit" form={formId} loading={isSubmitting}>
              {t(`Deadlines.${mode}Dialog.save`)}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </>
  );
}
