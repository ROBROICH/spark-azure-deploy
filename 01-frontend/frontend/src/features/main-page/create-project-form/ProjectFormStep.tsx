import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/features/ui/form/field';
import { Input } from '@/features/ui/input/Input';
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
  PROJECT_NAME_MAX_LENGTH,
  createProjectSchema,
  type ProjectStepValues,
} from '@/features/project/data/project-details-form/projectForm.schema';

export type { ProjectStepValues };

type ProjectFormStepProps = {
  defaultValues: ProjectStepValues;
  existingInternalProjectNumbers?: Iterable<string>;
  projectTypes: { id: string; name: string }[];
  projectTypesLoadFailed?: boolean;
  /**
   * Blocks advancing while duplicate-check dependencies (existing projects) are
   * still loading or failed to load. Gates both native and parent-triggered
   * submits so Enter cannot bypass the footer's disabled state.
   */
  disableSubmit?: boolean;
  onSubmit: (values: ProjectStepValues) => void;
  onFormReady?: (methods: { submit: () => void }) => void;
};

/** Step 1: Project details. Parent triggers submit via onFormReady ref. */
export function ProjectFormStep(
  props: ProjectFormStepProps,
): React.ReactElement {
  const {
    defaultValues,
    existingInternalProjectNumbers,
    projectTypes,
    projectTypesLoadFailed,
    disableSubmit = false,
    onSubmit: handleStepSubmit,
    onFormReady,
  } = props;
  const { t } = useTranslation('CreateProjectForm');
  const verfahrenSchema = createProjectSchema(
    t,
    existingInternalProjectNumbers,
  );

  const form = useForm({
    defaultValues,
    validationLogic: revalidateLogic({
      mode: 'submit',
      modeAfterSubmission: 'change',
    }),
    validators: {
      onDynamic: verfahrenSchema,
    },
    onSubmit: ({ value }) => {
      handleStepSubmit(value);
    },
  });

  const submitWhenAllowed = () => {
    if (disableSubmit) {
      return;
    }
    form.handleSubmit();
  };

  // Keep the latest guarded submit reachable from the once-registered handle
  // below without re-registering it (or duplicating the guard) on every render.
  const submitWhenAllowedRef = useRef<() => void>(() => undefined);

  // eslint-disable-next-line no-restricted-syntax -- keeps the parent-registered imperative submit handle current without re-registering it on every render.
  useEffect(() => {
    submitWhenAllowedRef.current = submitWhenAllowed;
  });

  // eslint-disable-next-line no-restricted-syntax -- registers the committed imperative submit handle with the stepper parent after render.
  useEffect(() => {
    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent -- registers a committed imperative submit handle with the stepper parent.
    onFormReady?.({
      submit: () => submitWhenAllowedRef.current(),
    });
  }, [onFormReady]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submitWhenAllowed();
      }}
      id="add-project-step1-form"
      className="flex flex-col gap-4"
    >
      <FieldGroup className="gap-4">
        <form.Field name="name">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0;
            const errorId = `${field.name}-error`;
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>
                  {t('step1.projectName')}*
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  maxLength={PROJECT_NAME_MAX_LENGTH}
                  autoComplete="off"
                  aria-required
                  aria-invalid={isInvalid}
                  aria-describedby={isInvalid ? errorId : undefined}
                />
                {isInvalid ? (
                  <FieldError id={errorId} errors={field.state.meta.errors} />
                ) : null}
              </Field>
            );
          }}
        </form.Field>
        <form.Field name="projectTypeId">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0;
            const errorId = 'add-project-type-error';
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="add-project-type">
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
                  ariaDescribedby={isInvalid ? errorId : undefined}
                />
                {isInvalid && (
                  <FieldError id={errorId} errors={field.state.meta.errors} />
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
                <FieldLabel htmlFor="add-project-federal-state">
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
                  ariaDescribedby={isInvalid ? errorId : undefined}
                />
                {isInvalid && (
                  <FieldError id={errorId} errors={field.state.meta.errors} />
                )}
              </Field>
            );
          }}
        </form.Field>
        <form.Field name="entryDate">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0;
            const errorId = `${field.name}-error`;
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>
                  {t('step1.antrageingang')}*
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  type="date"
                  max="9999-12-31"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  autoComplete="off"
                  aria-required
                  aria-invalid={isInvalid}
                  aria-describedby={isInvalid ? errorId : undefined}
                />
                {isInvalid ? (
                  <FieldError id={errorId} errors={field.state.meta.errors} />
                ) : null}
              </Field>
            );
          }}
        </form.Field>
        <form.Field name="internalProjectNumber">
          {(field) => {
            const isInvalid =
              field.state.meta.isTouched && field.state.meta.errors.length > 0;
            const errorId = `${field.name}-error`;
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor={field.name}>
                  {t('step1.aktenzeichen')}*
                </FieldLabel>
                <Input
                  id={field.name}
                  name={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  autoComplete="off"
                  aria-required
                  aria-invalid={isInvalid}
                  aria-describedby={isInvalid ? errorId : undefined}
                />
                {isInvalid ? (
                  <FieldError id={errorId} errors={field.state.meta.errors} />
                ) : null}
              </Field>
            );
          }}
        </form.Field>
      </FieldGroup>
    </form>
  );
}
