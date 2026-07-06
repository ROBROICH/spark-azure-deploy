import { Field } from '@/features/ui/form/field';
import {
  ApplicantInputControl,
  type ApplicantFieldApi,
} from '@/features/project/data/project-details-form/applicant-fields/ApplicantFieldControls';
import { useTranslation } from 'react-i18next';
import { replaceRequiredErrorMessage } from './createProjectFormErrors.logic';

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
  const requiredErrorMessages: Record<string, string> = {
    country: t('required.country'),
    houseNumber: t('required.houseNumber'),
    location: t('required.location'),
    plz: t('required.plz'),
    street: t('required.street'),
  };
  const requiredErrorMessage = requiredErrorMessages[field.name];
  const errors = requiredErrorMessage
    ? replaceRequiredErrorMessage(
        field.state.meta.errors,
        t('fieldRequired'),
        requiredErrorMessage,
      )
    : field.state.meta.errors;

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
        errors={errors}
        announceError={false}
      />
    </Field>
  );
}
