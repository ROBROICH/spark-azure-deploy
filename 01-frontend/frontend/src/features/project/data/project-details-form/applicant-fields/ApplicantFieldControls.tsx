import {
  APPLICANT_FIELD_AUTOCOMPLETE,
  type ApplicantAutocompleteField,
} from '@/features/project/data/project-details-form/applicant-fields/applicantAutocomplete';
import { FieldError, FieldLabel } from '@/features/ui/form/field';
import { Input } from '@/features/ui/input/Input';
import type React from 'react';

export type ApplicantFieldApi<TValue extends string = string> = {
  name: string;
  state: {
    value: TValue;
    meta: {
      errors: ({ message?: string } | undefined)[];
      isTouched: boolean;
    };
  };
  handleBlur: () => void;
  handleChange: (value: TValue | ((currentValue: TValue) => TValue)) => void;
};

type ApplicantInputControlProps = {
  field: ApplicantFieldApi;
  label: React.ReactNode;
  required?: boolean;
  type?: React.ComponentProps<typeof Input>['type'];
  inputMode?: React.ComponentProps<typeof Input>['inputMode'];
  maxLength?: number;
  placeholder?: string;
  autoComplete?: React.ComponentProps<typeof Input>['autoComplete'];
  containerClassName?: string;
  labelClassName?: string;
  transformValue?: (value: string) => string;
  hideLabel?: boolean;
};

function resolveApplicantAutoComplete(
  fieldName: string,
  override?: React.ComponentProps<typeof Input>['autoComplete'],
): React.ComponentProps<typeof Input>['autoComplete'] {
  if (override !== undefined) {
    return override;
  }
  if (Object.hasOwn(APPLICANT_FIELD_AUTOCOMPLETE, fieldName)) {
    return APPLICANT_FIELD_AUTOCOMPLETE[
      fieldName as ApplicantAutocompleteField
    ];
  }
  return undefined;
}

export function ApplicantInputControl(props: ApplicantInputControlProps) {
  const {
    field,
    label,
    required = false,
    type,
    inputMode,
    maxLength,
    placeholder,
    autoComplete,
    containerClassName,
    labelClassName,
    transformValue,
    hideLabel = false,
  } = props;
  const isInvalid =
    field.state.meta.isTouched && field.state.meta.errors.length > 0;
  const errorId = `${field.name}-error`;
  const resolvedAutoComplete = resolveApplicantAutoComplete(
    field.name,
    autoComplete,
  );

  return (
    <div className={containerClassName ?? 'flex flex-1 flex-col gap-1'}>
      <FieldLabel
        htmlFor={field.name}
        className={hideLabel ? 'sr-only' : labelClassName}
      >
        {label}
        {required ? '*' : null}
      </FieldLabel>
      <Input
        id={field.name}
        name={field.name}
        type={type}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => {
          const nextValue = transformValue
            ? transformValue(event.target.value)
            : event.target.value;
          field.handleChange(nextValue);
        }}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        autoComplete={resolvedAutoComplete}
        aria-required={required || undefined}
        aria-invalid={isInvalid}
        aria-describedby={isInvalid ? errorId : undefined}
      />
      {isInvalid ? (
        <FieldError id={errorId} errors={field.state.meta.errors} />
      ) : null}
    </div>
  );
}
