import { v1ProjectLogicCheckInternalProjectNumber } from '@/api-clients/backend';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/features/ui/form/field';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';
import { revalidateLogic, useForm } from '@tanstack/react-form';
import type React from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  federalStateCodes,
  isFederalStateCode,
} from '@/features/project/data/project-details-form/federalStates';
import {
  createProjectSchema,
  type ProjectStepValues,
} from '@/features/project/data/project-details-form/projectForm.schema';
import { replaceProjectRequiredErrorMessage } from './createProjectFormErrors.logic';
import { focusFirstInvalidFormControl } from './focusFirstInvalidFormControl';
import { ProjectInputField } from './ProjectFormStepFields';

export type { ProjectStepValues };

const ADD_PROJECT_TYPE_LABEL_ID = 'add-project-type-label';
const ADD_PROJECT_FEDERAL_STATE_LABEL_ID = 'add-project-federal-state-label';

type ProjectFormStepProps = {
  defaultValues: ProjectStepValues;
  projectTypes: { id: string; name: string }[];
  projectTypesLoadFailed?: boolean;
  onSubmit: (values: ProjectStepValues) => void;
  onFormReady?: (methods: { submit: () => void }) => void;
};

/**
 * Project-number validation must not depend on the currently loaded list page.
 * @param props - Step values, available project types, and stepper callbacks.
 * @returns The project step with server-backed, fail-closed submission validation.
 */
export function ProjectFormStep(
  props: ProjectFormStepProps,
): React.ReactElement {
  const {
    defaultValues,
    projectTypes,
    projectTypesLoadFailed,
    onSubmit: handleStepSubmit,
    onFormReady,
  } = props;
  const { t } = useTranslation('CreateProjectForm');
  const formRef = useRef<HTMLFormElement>(null);
  const verfahrenSchema = createProjectSchema(t);
  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic({
      mode: 'submit',
      modeAfterSubmission: 'change',
    }),
    validators: {
      onDynamic: verfahrenSchema,
      onSubmitAsync:
        /**
         * An unavailable number check must block submission just like a conflict.
         * @param submission - Candidate project values from TanStack Form.
         * @returns A field error for a conflict or failed check; otherwise no error.
         */
        async ({ value }) => {
          try {
            const { data } = await v1ProjectLogicCheckInternalProjectNumber({
              query: { value: value.internalProjectNumber.trim() },
              throwOnError: true,
            });
            if (!data.available) {
              return {
                fields: {
                  internalProjectNumber: {
                    message: t('internalProjectNumberDuplicate'),
                  },
                },
              };
            }
          } catch {
            return {
              fields: {
                internalProjectNumber: {
                  message: t('internalProjectNumberCheckError'),
                },
              },
            };
          }
        },
    },
    onSubmit: ({ value }) => {
      handleStepSubmit(value);
    },
    onSubmitInvalid: () => {
      focusFirstInvalidFormControl(formRef);
    },
  });

  // eslint-disable-next-line no-restricted-syntax -- registers the committed imperative submit handle with the stepper parent after render.
  useEffect(() => {
    onFormReady?.({
      submit: () => {
        void form.handleSubmit();
      },
    });
  }, [form, onFormReady]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      id="add-project-step1-form"
      ref={formRef}
      className="flex flex-col gap-4"
    >
      <FieldGroup className="gap-4">
        <form.Field name="name">
          {(field) => (
            <ProjectInputField field={field} labelKey="step1.projectName" />
          )}
        </form.Field>
        <form.Field name="projectTypeId">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0;
            const errorId = 'add-project-type-error';
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel
                  id={ADD_PROJECT_TYPE_LABEL_ID}
                  htmlFor="add-project-type"
                >
                  {t('step1.type')}*
                </FieldLabel>
                <SelectMenu
                  id="add-project-type"
                  items={projectTypes.map((type) => ({
                    value: type.id,
                    label: type.name,
                  }))}
                  value={field.state.value}
                  onChange={(v) => field.handleChange(v)}
                  invalid={isInvalid}
                  onBlur={field.handleBlur}
                  placeholder={t('step1.selectType')}
                  triggerClassName="w-full"
                  required
                  ariaLabelledBy={ADD_PROJECT_TYPE_LABEL_ID}
                  ariaDescribedby={isInvalid ? errorId : undefined}
                />
                {isInvalid && (
                  <FieldError
                    id={errorId}
                    announce={false}
                    errors={replaceProjectRequiredErrorMessage(
                      field.state.meta.errors,
                      field.name,
                      t,
                    )}
                  />
                )}
                {projectTypesLoadFailed && projectTypes.length === 0 && (
                  <div
                    className="mt-3 rounded border border-red-400 bg-red-100 p-3 text-red-700"
                    role="alert"
                    aria-live="assertive"
                  >
                    {t('step1.typesLoadFailed')}
                  </div>
                )}
              </Field>
            );
          }}
        </form.Field>
        <form.Field name="federalState">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0;
            const errorId = 'add-project-federal-state-error';
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel
                  id={ADD_PROJECT_FEDERAL_STATE_LABEL_ID}
                  htmlFor="add-project-federal-state"
                >
                  {t('step1.federalState')}*
                </FieldLabel>
                <SelectMenu
                  id="add-project-federal-state"
                  items={federalStateCodes.map((code) => ({
                    value: code,
                    label: t(`step1.federalStates.${code}`),
                  }))}
                  value={field.state.value}
                  onChange={(value) => {
                    if (isFederalStateCode(value)) {
                      field.handleChange(value);
                    }
                  }}
                  invalid={isInvalid}
                  onBlur={field.handleBlur}
                  triggerClassName="w-full"
                  required
                  ariaLabelledBy={ADD_PROJECT_FEDERAL_STATE_LABEL_ID}
                  ariaDescribedby={isInvalid ? errorId : undefined}
                />
                {isInvalid && (
                  <FieldError
                    id={errorId}
                    announce={false}
                    errors={replaceProjectRequiredErrorMessage(
                      field.state.meta.errors,
                      field.name,
                      t,
                    )}
                  />
                )}
              </Field>
            );
          }}
        </form.Field>
        <form.Field name="entryDate">
          {(field) => (
            <ProjectInputField field={field} labelKey="step1.antrageingang" />
          )}
        </form.Field>
        <form.Field name="internalProjectNumber">
          {(field) => (
            <ProjectInputField field={field} labelKey="step1.aktenzeichen" />
          )}
        </form.Field>
      </FieldGroup>
    </form>
  );
}
