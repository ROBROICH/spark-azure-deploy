import type { ProjectStepValues } from '@/features/project/data/project-details-form/projectForm.schema';

type FieldErrorMessage = { message?: string } | undefined;
type Translate = (key: string) => string;

const PROJECT_REQUIRED_ERROR_KEYS = {
  name: 'required.projectName',
  projectTypeId: 'required.projectType',
  federalState: 'required.federalState',
  entryDate: 'required.entryDate',
  internalProjectNumber: 'required.internalProjectNumber',
} satisfies Record<keyof ProjectStepValues, string>;

export function replaceRequiredErrorMessage(
  errors: FieldErrorMessage[],
  requiredMessage: string,
  fieldRequiredMessage: string,
): FieldErrorMessage[] {
  if (errors.some((error) => error?.message === requiredMessage)) {
    return [{ message: fieldRequiredMessage }];
  }

  return errors;
}

export function replaceProjectRequiredErrorMessage(
  errors: FieldErrorMessage[],
  fieldName: keyof ProjectStepValues,
  t: Translate,
): FieldErrorMessage[] {
  return replaceRequiredErrorMessage(
    errors,
    t('fieldRequired'),
    t(PROJECT_REQUIRED_ERROR_KEYS[fieldName]),
  );
}
