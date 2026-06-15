import { FieldLabel } from '@/features/ui/form/field';
import {
  ApplicantInputControl,
  type ApplicantFieldApi,
} from '@/features/project/data/project-details-form/applicant-fields/ApplicantFieldControls';
import type React from 'react';
import { useTranslation } from 'react-i18next';

type ApplicantFieldRowProps = {
  labelKey: string;
  children: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
};

export function ApplicantFieldRow(props: ApplicantFieldRowProps) {
  const { t } = useTranslation('Project');
  const { labelKey, children, htmlFor, required = false } = props;

  return (
    <div className="flex items-start border-b border-border-primary">
      <FieldLabel
        htmlFor={htmlFor}
        className="w-36 shrink-0 px-3 py-[11px] text-sm font-medium tracking-tight text-text-primary"
      >
        {t(labelKey)}
        {required ? '*' : null}
      </FieldLabel>
      <div className="flex flex-1 flex-col gap-1 px-3 py-2">{children}</div>
    </div>
  );
}

type ApplicantInputFieldProps = {
  field: ApplicantFieldApi;
  labelKey: string;
  required?: boolean;
  type?: React.ComponentProps<typeof ApplicantInputControl>['type'];
  inputMode?: React.ComponentProps<typeof ApplicantInputControl>['inputMode'];
  maxLength?: number;
  containerClassName?: string;
  labelClassName?: string;
  transformValue?: (value: string) => string;
  hideLabel?: boolean;
};

export function ApplicantInputField(props: ApplicantInputFieldProps) {
  const { t } = useTranslation('Project');
  const {
    field,
    labelKey,
    required = false,
    type,
    inputMode,
    maxLength,
    containerClassName,
    labelClassName,
    transformValue,
    hideLabel = false,
  } = props;

  return (
    <ApplicantInputControl
      field={field}
      label={t(labelKey)}
      required={required}
      type={type}
      inputMode={inputMode}
      maxLength={maxLength}
      containerClassName={containerClassName}
      labelClassName={labelClassName}
      transformValue={transformValue}
      hideLabel={hideLabel}
    />
  );
}
