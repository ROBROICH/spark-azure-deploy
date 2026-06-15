import type { DeadlineFormValues } from '@/features/project/overview-screen/schemas';
import { Field, FieldError, FieldLabel } from '@/features/ui/form/field';
import { Input } from '@/features/ui/input/Input';
import { Button } from '@/features/ui/button/Button';
import {
  DialogBody,
  DialogClose,
  DialogFooter,
} from '@/features/ui/dialog/Dialog';
import type {
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  ReactFormExtendedApi,
} from '@tanstack/react-form';

type DeadlineDialogFormApi<
  TOnMount extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnChange extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnChangeAsync extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TOnBlur extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnBlurAsync extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TOnSubmit extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TOnDynamic extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TOnServer extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TSubmitMeta,
> = ReactFormExtendedApi<
  DeadlineFormValues,
  TOnMount,
  TOnChange,
  TOnChangeAsync,
  TOnBlur,
  TOnBlurAsync,
  TOnSubmit,
  TOnSubmitAsync,
  TOnDynamic,
  TOnDynamicAsync,
  TOnServer,
  TSubmitMeta
>;

type DeadlineDialogFormLabels = {
  cancel: string;
  deadlineType: string;
  endAt: string;
  legalBasis: string;
  save: string;
  startAt: string;
};

type DeadlineDialogFormProps<
  TOnMount extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnChange extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnChangeAsync extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TOnBlur extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnBlurAsync extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TOnSubmit extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TOnDynamic extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TOnServer extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TSubmitMeta,
> = {
  form: DeadlineDialogFormApi<
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TOnServer,
    TSubmitMeta
  >;
  formId: string;
  labels: DeadlineDialogFormLabels;
};

export function DeadlineDialogForm<
  TOnMount extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnChange extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnChangeAsync extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TOnBlur extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnBlurAsync extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TOnSubmit extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnSubmitAsync extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TOnDynamic extends undefined | FormValidateOrFn<DeadlineFormValues>,
  TOnDynamicAsync extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TOnServer extends undefined | FormAsyncValidateOrFn<DeadlineFormValues>,
  TSubmitMeta,
>(
  props: DeadlineDialogFormProps<
    TOnMount,
    TOnChange,
    TOnChangeAsync,
    TOnBlur,
    TOnBlurAsync,
    TOnSubmit,
    TOnSubmitAsync,
    TOnDynamic,
    TOnDynamicAsync,
    TOnServer,
    TSubmitMeta
  >,
) {
  const { form, formId, labels } = props;

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
              return (
                <Field data-invalid={isInvalid || undefined}>
                  <FieldLabel htmlFor={field.name}>
                    {labels.deadlineType}*
                  </FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-required
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="startAt">
            {(field) => {
              const isInvalid = field.state.meta.errors.length > 0;
              return (
                <Field data-invalid={isInvalid || undefined}>
                  <FieldLabel htmlFor={field.name}>
                    {labels.startAt}*
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
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </Field>
              );
            }}
          </form.Field>
          <form.Field name="endAt">
            {(field) => (
              <form.Subscribe selector={(state) => state.values.startAt}>
                {(startAt) => {
                  const isInvalid = field.state.meta.errors.length > 0;
                  return (
                    <Field data-invalid={isInvalid || undefined}>
                      <FieldLabel htmlFor={field.name}>
                        {labels.endAt}*
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
                      />
                      {isInvalid && (
                        <FieldError errors={field.state.meta.errors} />
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
                  {labels.legalBasis}
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
            {labels.cancel}
          </Button>
        </DialogClose>
        <Button type="submit" form={formId}>
          {labels.save}
        </Button>
      </DialogFooter>
    </>
  );
}
