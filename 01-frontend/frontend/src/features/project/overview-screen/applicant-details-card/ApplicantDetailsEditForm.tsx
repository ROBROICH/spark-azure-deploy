import { type ProjectResponse } from '@/api-clients/pls-module';
import { projectsCollection } from '@/features/project/data/collections/projects.collection';
import type { ApplicantAutocompleteField } from '@/features/project/data/project-details-form/applicant-fields/applicantAutocomplete';
import { editApplicantSchema } from '@/features/project/overview-screen/schemas';
import { FieldLabel } from '@/features/ui/form/field';
import { Button } from '@/features/ui/button/Button';
import { toast } from '@/features/ui/toast/Toast';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import {
  ApplicantFieldRow,
  ApplicantInputField,
} from './ApplicantDetailsEditFormFields';
import {
  buildApplicantDefaultValues,
  buildApplicantPatchBody,
} from './ApplicantDetailsEditFormUtils';

type SingleLineFieldConfig = {
  name: Extract<ApplicantAutocompleteField, 'country' | 'email' | 'phone'>;
  labelKey: string;
  required?: boolean;
  type?: 'email' | 'tel';
};

const SINGLE_LINE_FIELD_CONFIGS: ReadonlyArray<SingleLineFieldConfig> = [
  {
    name: 'country',
    labelKey: 'ApplicantDetails.country',
    required: true,
  },
  { name: 'email', labelKey: 'ApplicantDetails.email', type: 'email' },
  { name: 'phone', labelKey: 'ApplicantDetails.phone', type: 'tel' },
] as const;

export type ApplicantDetailsEditFormProps = {
  canMutateProject: boolean;
  project: Pick<
    ProjectResponse,
    | 'id'
    | 'company'
    | 'firstName'
    | 'lastName'
    | 'street'
    | 'houseNumber'
    | 'addressSupplement'
    | 'plz'
    | 'location'
    | 'country'
    | 'email'
    | 'phone'
  >;
  onCancel: () => void;
  onSaved: () => void;
};

/**
 * Renders the inline applicant edit form and persists optimistic updates into the projects collection.
 *
 * @param props Form callbacks and the current applicant snapshot from the project.
 * @returns The applicant details edit form.
 */
export function ApplicantDetailsEditForm(props: ApplicantDetailsEditFormProps) {
  const { canMutateProject, project, onCancel, onSaved } = props;
  const { t } = useTranslation('Project');
  const getApplicantEditMessage = (key: string) =>
    t(`ApplicantDetails.edit.${key}`);
  const schema = editApplicantSchema(getApplicantEditMessage);
  const defaultValues = buildApplicantDefaultValues(project);
  const form = useForm({
    defaultValues,
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => {
      if (!canMutateProject) {
        onCancel();
        return;
      }

      const body = buildApplicantPatchBody(value);
      projectsCollection.update(project.id, (draft) => {
        Object.assign(draft, body);
      });
      toast.success(t('ApplicantDetails.edit.saveSuccess'));
      onSaved();
    },
  });

  return (
    <div className="overflow-clip rounded-lg border border-border-primary bg-neutral-white pt-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
        aria-label={t('ApplicantDetails.editAriaLabel')}
      >
        <form.Field name="company">
          {(field) => (
            <ApplicantFieldRow
              labelKey="ApplicantDetails.company"
              htmlFor={field.name}
            >
              <ApplicantInputField
                field={field}
                labelKey="ApplicantDetails.company"
                hideLabel
              />
            </ApplicantFieldRow>
          )}
        </form.Field>
        <ApplicantFieldRow labelKey="ApplicantDetails.contactPerson">
          <div className="flex gap-3">
            <form.Field name="firstName">
              {(field) => (
                <ApplicantInputField
                  field={field}
                  labelKey="ApplicantDetails.firstName"
                  containerClassName="flex flex-1 flex-col gap-1"
                  labelClassName="text-sm text-text-secondary"
                />
              )}
            </form.Field>
            <form.Field name="lastName">
              {(field) => (
                <ApplicantInputField
                  field={field}
                  labelKey="ApplicantDetails.lastName"
                  containerClassName="flex flex-1 flex-col gap-1"
                  labelClassName="text-sm text-text-secondary"
                />
              )}
            </form.Field>
          </div>
        </ApplicantFieldRow>
        <div className="flex items-start border-b border-border-primary">
          <FieldLabel className="w-36 shrink-0 px-3 py-[11px] text-sm font-medium tracking-tight text-text-primary">
            {t('ApplicantDetails.address')}
          </FieldLabel>
          <div className="flex flex-1 flex-col gap-3 px-3 py-2">
            <div className="flex gap-3">
              <form.Field name="street">
                {(field) => (
                  <ApplicantInputField
                    field={field}
                    labelKey="ApplicantDetails.street"
                    required
                    containerClassName="flex flex-[2] flex-col gap-1"
                    labelClassName="text-sm text-text-secondary"
                  />
                )}
              </form.Field>
              <form.Field name="houseNumber">
                {(field) => (
                  <ApplicantInputField
                    field={field}
                    labelKey="ApplicantDetails.houseNumber"
                    required
                    containerClassName="flex flex-1 flex-col gap-1"
                    labelClassName="text-sm text-text-secondary"
                  />
                )}
              </form.Field>
            </div>
            <form.Field name="addressSupplement">
              {(field) => (
                <ApplicantInputField
                  field={field}
                  labelKey="ApplicantDetails.addressSupplement"
                  containerClassName="flex flex-col gap-1"
                  labelClassName="text-sm text-text-secondary"
                />
              )}
            </form.Field>
            <div className="flex gap-3">
              <form.Field name="plz">
                {(field) => (
                  <ApplicantInputField
                    field={field}
                    labelKey="ApplicantDetails.plz"
                    required
                    containerClassName="flex w-28 shrink-0 flex-col gap-1"
                    labelClassName="text-sm text-text-secondary"
                    inputMode="numeric"
                    maxLength={5}
                    transformValue={(value) =>
                      value.replace(/\D/g, '').slice(0, 5)
                    }
                  />
                )}
              </form.Field>
              <form.Field name="location">
                {(field) => (
                  <ApplicantInputField
                    field={field}
                    labelKey="ApplicantDetails.location"
                    required
                    containerClassName="flex flex-1 flex-col gap-1"
                    labelClassName="text-sm text-text-secondary"
                  />
                )}
              </form.Field>
            </div>
          </div>
        </div>
        {SINGLE_LINE_FIELD_CONFIGS.map((config) => (
          <form.Field key={config.name} name={config.name}>
            {(field) => (
              <ApplicantFieldRow
                labelKey={config.labelKey}
                htmlFor={field.name}
                required={config.required}
              >
                <ApplicantInputField
                  field={field}
                  labelKey={config.labelKey}
                  required={config.required}
                  type={config.type}
                  hideLabel
                />
              </ApplicantFieldRow>
            )}
          </form.Field>
        ))}

        <div className="flex justify-end gap-2 px-3 py-3">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('ApplicantDetails.edit.cancel')}
          </Button>
          <Button type="submit">{t('ApplicantDetails.edit.save')}</Button>
        </div>
      </form>
    </div>
  );
}
