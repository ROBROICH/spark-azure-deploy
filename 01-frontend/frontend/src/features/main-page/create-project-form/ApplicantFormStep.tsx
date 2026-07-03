import { FieldGroup } from '@/features/ui/form/field';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  createApplicantSchema,
  type ApplicantStepValues,
} from '@/features/project/data/project-details-form/projectForm.schema';
import { ApplicantInputField } from './ApplicantFormStepFields';
import { focusFirstInvalidFormControl } from './focusFirstInvalidFormControl';

export type { ApplicantStepValues };

type ApplicantFormStepProps = {
  defaultValues: ApplicantStepValues;
  onSubmit: (values: ApplicantStepValues) => void;
  onFormReady?: (methods: {
    getValues: () => ApplicantStepValues;
    submit: () => void;
  }) => void;
};

/**
 * Step 2 of the create-project flow: applicant/contact form (company, name, address, contact).
 * Exposes submit via onFormReady for parent-controlled submission (e.g. from a stepper footer).
 */
export function ApplicantFormStep(
  props: ApplicantFormStepProps,
): React.ReactElement {
  const { defaultValues, onSubmit: handleStepSubmit, onFormReady } = props;
  const { t } = useTranslation('CreateProjectForm');
  const applicantSchema = createApplicantSchema(t);
  const formRef = useRef<HTMLFormElement>(null);

  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic({
      mode: 'submit',
      modeAfterSubmission: 'change',
    }),
    validators: {
      onDynamic: applicantSchema,
    },
    onSubmit: ({ value }) => {
      handleStepSubmit(value);
    },
    onSubmitInvalid: () => {
      focusFirstInvalidFormControl(formRef);
    },
  });

  // eslint-disable-next-line no-restricted-syntax -- registers the committed imperative form handle with the stepper parent after render.
  useEffect(() => {
    onFormReady?.({
      getValues: () => form.state.values,
      submit: () => form.handleSubmit(),
    });
  }, [onFormReady, form]);

  // Focus the first input when step 2 mounts
  // eslint-disable-next-line no-restricted-syntax -- intentional imperative focus on mount
  useEffect(() => {
    const firstInput = formRef.current?.querySelector<HTMLElement>(
      'input, button[role="combobox"]',
    );
    firstInput?.focus();
  }, []);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
      id="add-project-step2-form"
      ref={formRef}
      className="flex flex-col gap-4"
    >
      <FieldGroup className="gap-4">
        <div className="grid grid-cols-2 gap-x-3">
          <form.Field name="firstName">
            {(field) => (
              <ApplicantInputField field={field} labelKey="step2.firstName" />
            )}
          </form.Field>
          <form.Field name="lastName">
            {(field) => (
              <ApplicantInputField field={field} labelKey="step2.lastName" />
            )}
          </form.Field>
        </div>
        <form.Field name="company">
          {(field) => (
            <ApplicantInputField field={field} labelKey="step2.company" />
          )}
        </form.Field>
        <div className="grid grid-cols-2 gap-x-3">
          <form.Field name="street">
            {(field) => (
              <ApplicantInputField
                field={field}
                labelKey="step2.street"
                required
              />
            )}
          </form.Field>
          <form.Field name="houseNumber">
            {(field) => (
              <ApplicantInputField
                field={field}
                labelKey="step2.houseNumber"
                required
              />
            )}
          </form.Field>
        </div>
        <form.Field name="addressSupplement">
          {(field) => (
            <ApplicantInputField
              field={field}
              labelKey="step2.addressSupplement"
            />
          )}
        </form.Field>
        <div className="grid grid-cols-2 gap-x-3">
          <form.Field name="plz">
            {(field) => (
              <ApplicantInputField
                field={field}
                labelKey="step2.plz"
                required
                inputMode="numeric"
                maxLength={5}
                placeholder="12345"
                transformValue={(value) => value.replace(/\D/g, '').slice(0, 5)}
              />
            )}
          </form.Field>
          <form.Field name="location">
            {(field) => (
              <ApplicantInputField
                field={field}
                labelKey="step2.location"
                required
              />
            )}
          </form.Field>
        </div>
        <form.Field name="country">
          {(field) => (
            <ApplicantInputField
              field={field}
              labelKey="step2.country"
              required
            />
          )}
        </form.Field>
        <form.Field name="email">
          {(field) => (
            <ApplicantInputField
              field={field}
              labelKey="step2.email"
              type="email"
            />
          )}
        </form.Field>
        <form.Field name="phone">
          {(field) => (
            <ApplicantInputField
              field={field}
              labelKey="step2.phone"
              type="tel"
            />
          )}
        </form.Field>
      </FieldGroup>
    </form>
  );
}
