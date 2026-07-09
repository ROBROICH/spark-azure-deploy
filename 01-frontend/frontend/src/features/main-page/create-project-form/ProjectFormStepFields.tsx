import {
  PROJECT_NAME_MAX_LENGTH,
  type ProjectStepValues,
} from '@/features/project/data/project-details-form/projectForm.schema';
import { Field, FieldError, FieldLabel } from '@/features/ui/form/field';
import { Input } from '@/features/ui/input/Input';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { replaceProjectRequiredErrorMessage } from './createProjectFormErrors.logic';

type ProjectInputFieldName = Extract<
  keyof ProjectStepValues,
  'entryDate' | 'internalProjectNumber' | 'name'
>;

type ProjectInputFieldApi = {
  name: ProjectInputFieldName;
  state: {
    value: string;
    meta: {
      errors: ({ message?: string } | undefined)[];
      isTouched: boolean;
    };
  };
  handleBlur: () => void;
  handleChange: (value: string | ((currentValue: string) => string)) => void;
};

type ProjectInputFieldProps = {
  field: ProjectInputFieldApi;
  labelKey: string;
};

export function ProjectInputField(
  props: ProjectInputFieldProps,
): React.ReactElement {
  const { field, labelKey } = props;
  const { t } = useTranslation('CreateProjectForm');
  const isInvalid =
    field.state.meta.isTouched && field.state.meta.errors.length > 0;
  const errorId = `${field.name}-error`;
  const isEntryDate = field.name === 'entryDate';

  return (
    <Field data-invalid={isInvalid}>
      <FieldLabel htmlFor={field.name}>{t(labelKey)}*</FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        type={isEntryDate ? 'date' : undefined}
        max={isEntryDate ? '9999-12-31' : undefined}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
        maxLength={field.name === 'name' ? PROJECT_NAME_MAX_LENGTH : undefined}
        autoComplete="off"
        aria-required
        aria-invalid={isInvalid}
        aria-describedby={isInvalid ? errorId : undefined}
      />
      {isInvalid ? (
        <FieldError
          id={errorId}
          announce={false}
          errors={replaceProjectRequiredErrorMessage(
            field.state.meta.errors,
            field.name,
            t,
          )}
        />
      ) : null}
    </Field>
  );
}
