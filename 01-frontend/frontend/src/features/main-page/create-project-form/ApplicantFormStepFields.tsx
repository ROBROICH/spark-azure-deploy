import { Field } from '@/features/ui/form/field';
import {
  ApplicantInputControl,
  type ApplicantFieldApi,
} from '@/features/project/data/project-details-form/applicant-fields/ApplicantFieldControls';
import { useTranslation } from 'react-i18next';

type ApplicantInputFieldProps = {
  field: ApplicantFieldApi;
  labelKey: string;
  required?: boolean;
  type?: React.ComponentProps<typeof ApplicantInputControl>['type'];
  inputMode?: React.ComponentProps<typeof ApplicantInputControl>['inputMode'];
  maxLength?: number;
  placeholder?: string;
  transformValue?: (value: string) => string;
};

export function ApplicantInputField(props: ApplicantInputFieldProps) {
  const { t } = useTranslation('CreateProjectForm');
  const {
    field,
    labelKey,
    required = false,
    type,
    inputMode,
    maxLength,
    placeholder,
    transformValue,
  } = props;
  const isInvalid =
    field.state.meta.isTouched && field.state.meta.errors.length > 0;

  return (
    <Field data-invalid={isInvalid}>
      <ApplicantInputControl
        field={field}
        label={t(labelKey)}
        required={required}
        type={type}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        transformValue={transformValue}
      />
    </Field>
  );
}
