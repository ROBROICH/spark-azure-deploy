import {
  v1ProjectLogicCheckInternalProjectNumber,
  type ProjectResponse,
} from '@/api-clients/backend';
import { germanStates } from '@/features/project/data/project-details-form/federalStates';
import { projectsCollection } from '@/features/project/data/collections/projects.collection';
import { toEditableProjectTypeItems } from '@/features/project/data/project-types/projectTypeOptions.logic';
import { projectTypesCollection } from '@/features/project/data/project-types/projectTypes.collection';
import {
  createProjectDetailsSchema,
  PROJECT_NAME_MAX_LENGTH,
} from '@/features/project/data/project-details-form/projectForm.schema';
import { type EditProjectValues } from '@/features/project/overview-screen/schemas';
import { FieldError, FieldLabel } from '@/features/ui/form/field';
import { Input } from '@/features/ui/input/Input';
import { Button } from '@/features/ui/button/Button';
import { toast } from '@/features/ui/toast/Toast';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';
import { useLiveQuery } from '@tanstack/react-db';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';

export type ProjectDetailsEditFormProps = {
  canMutateProject: boolean;
  project: Pick<
    ProjectResponse,
    | 'id'
    | 'name'
    | 'projectTypeId'
    | 'internalProjectNumber'
    | 'entryDate'
    | 'state'
  >;
  onCancel: () => void;
  onSaved: () => void;
};

const EDIT_PROJECT_TYPE_LABEL_ID = 'edit-project-type-label';
const EDIT_FEDERAL_STATE_LABEL_ID = 'edit-federal-state-label';

/** Inline edit form for project details. Persists changes via projectsCollection.update() for optimistic updates. */
export function ProjectDetailsEditForm(props: ProjectDetailsEditFormProps) {
  const { canMutateProject, project, onCancel, onSaved } = props;
  const { t } = useTranslation('Project');
  const getProjectEditMessage = (key: string) =>
    t(`ProjectDetails.edit.${key}`);

  const { data: projectTypes } = useLiveQuery((q) =>
    q.from({ projectTypes: projectTypesCollection }),
  );
  const projectTypeItems = toEditableProjectTypeItems(
    projectTypes,
    project.projectTypeId,
    (name) => t('ProjectDetails.edit.inactiveType', { name }),
  );
  const federalStateItems = germanStates.map((state) => ({
    value: state,
    label: t(`ProjectDetails.federalStates.${state}`),
  }));

  const schema = createProjectDetailsSchema(getProjectEditMessage);

  const defaultValues: EditProjectValues = {
    name: project.name || '',
    projectTypeId: project.projectTypeId || '',
    entryDate: project.entryDate || '',
    internalProjectNumber: project.internalProjectNumber || '',
  };

  const form = useForm({
    defaultValues,
    validators: {
      onSubmit: schema,
      onSubmitAsync:
        /**
         * Excluding this authorized project permits an unchanged number without ignoring others.
         * @param submission - Candidate fields from the active edit form.
         * @returns A field error for a conflicting number or unavailable server check.
         */
        async ({ value }) => {
          try {
            const { data } = await v1ProjectLogicCheckInternalProjectNumber({
              query: {
                value: value.internalProjectNumber.trim(),
                excludeProjectId: project.id,
              },
              throwOnError: true,
            });
            if (!data.available) {
              return {
                fields: {
                  internalProjectNumber: {
                    message: getProjectEditMessage(
                      'internalProjectNumberDuplicate',
                    ),
                  },
                },
              };
            }
          } catch {
            return {
              fields: {
                internalProjectNumber: {
                  message: getProjectEditMessage(
                    'internalProjectNumberCheckError',
                  ),
                },
              },
            };
          }
        },
    },
    onSubmit: ({ value }) => {
      if (!canMutateProject) {
        onCancel();
        return;
      }

      projectsCollection.update(project.id, (draft) => {
        Object.assign(draft, {
          name: value.name.trim(),
          projectTypeId: value.projectTypeId.trim(),
          entryDate: value.entryDate.trim() || null,
          internalProjectNumber: value.internalProjectNumber.trim(),
        });
      });
      toast.success(t('ProjectDetails.edit.saveSuccess'));
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
        aria-label={t('ProjectDetails.editAriaLabel')}
      >
        <form.Field name="name">
          {(field) => {
            const isInvalid = field.state.meta.errors.length > 0;
            const errorId = `${field.name}-error`;
            return (
              <div className="flex flex-col items-start border-b border-border-primary lg:flex-row">
                <FieldLabel
                  htmlFor={field.name}
                  className="w-36 shrink-0 px-3 py-[11px] text-sm font-medium tracking-tight text-text-primary"
                >
                  {t('ProjectDetails.projectName')}*
                </FieldLabel>
                <div className="flex flex-1 flex-col gap-1 px-3 py-2">
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    maxLength={PROJECT_NAME_MAX_LENGTH}
                    aria-required
                    aria-invalid={isInvalid}
                    aria-describedby={isInvalid ? errorId : undefined}
                  />
                  {isInvalid && (
                    <FieldError id={errorId} errors={field.state.meta.errors} />
                  )}
                </div>
              </div>
            );
          }}
        </form.Field>
        <form.Field name="projectTypeId">
          {(field) => {
            const isInvalid = field.state.meta.errors.length > 0;
            return (
              <div className="flex flex-col items-start border-b border-border-primary lg:flex-row">
                <FieldLabel
                  id={EDIT_PROJECT_TYPE_LABEL_ID}
                  htmlFor="edit-project-type"
                  className="w-36 shrink-0 px-3 py-[11px] text-sm font-medium tracking-tight text-text-primary"
                >
                  {t('ProjectDetails.art')}*
                </FieldLabel>
                <div className="flex flex-1 flex-col gap-1 px-3 py-2">
                  <SelectMenu
                    items={projectTypeItems}
                    value={field.state.value}
                    onChange={(value) => field.handleChange(value)}
                    id="edit-project-type"
                    invalid={isInvalid}
                    required
                    ariaLabelledBy={EDIT_PROJECT_TYPE_LABEL_ID}
                    ariaDescribedby={
                      isInvalid ? 'edit-project-type-error' : undefined
                    }
                    onBlur={field.handleBlur}
                    placeholder={t('ProjectDetails.edit.selectType')}
                    triggerClassName="w-full"
                  />
                  {isInvalid && (
                    <FieldError
                      id="edit-project-type-error"
                      errors={field.state.meta.errors}
                    />
                  )}
                </div>
              </div>
            );
          }}
        </form.Field>
        <form.Field name="internalProjectNumber">
          {(field) => {
            const isInvalid = field.state.meta.errors.length > 0;
            return (
              <div className="flex flex-col items-start border-b border-border-primary lg:flex-row">
                <FieldLabel
                  htmlFor={field.name}
                  className="w-36 shrink-0 px-3 py-[11px] text-sm font-medium tracking-tight text-text-primary"
                >
                  {t('ProjectDetails.aktenzeichen')}*
                </FieldLabel>
                <div className="flex flex-1 flex-col gap-1 px-3 py-2">
                  <Input
                    id={field.name}
                    name={field.name}
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-required
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </div>
              </div>
            );
          }}
        </form.Field>
        <div className="flex flex-col items-start border-b border-border-primary lg:flex-row">
          <FieldLabel
            id={EDIT_FEDERAL_STATE_LABEL_ID}
            htmlFor="edit-federal-state"
            className="w-36 shrink-0 px-3 py-[11px] text-sm font-medium tracking-tight text-text-primary"
          >
            {t('ProjectDetails.federalState')}*
          </FieldLabel>
          <div className="flex flex-1 flex-col gap-1 px-3 py-2">
            <SelectMenu
              items={federalStateItems}
              value={project.state || ''}
              onChange={() => undefined}
              id="edit-federal-state"
              disabled
              ariaLabelledBy={EDIT_FEDERAL_STATE_LABEL_ID}
              placeholder={t('ProjectDetails.edit.selectState')}
              triggerClassName="w-full"
            />
          </div>
        </div>
        <form.Field name="entryDate">
          {(field) => {
            const isInvalid = field.state.meta.errors.length > 0;
            return (
              <div className="flex flex-col items-start border-b border-border-primary lg:flex-row">
                <FieldLabel
                  htmlFor={field.name}
                  className="w-36 shrink-0 px-3 py-[11px] text-sm font-medium tracking-tight text-text-primary"
                >
                  {t('ProjectDetails.entryDate')}*
                </FieldLabel>
                <div className="flex flex-1 flex-col gap-1 px-3 py-2">
                  <Input
                    id={field.name}
                    name={field.name}
                    type="date"
                    max="9999-12-31"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => field.handleChange(e.target.value)}
                    aria-required
                    aria-invalid={isInvalid}
                  />
                  {isInvalid && <FieldError errors={field.state.meta.errors} />}
                </div>
              </div>
            );
          }}
        </form.Field>
        <div className="flex justify-end gap-2 px-3 py-3">
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t('ProjectDetails.edit.cancel')}
          </Button>
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <Button type="submit" disabled={isSubmitting}>
                {t('ProjectDetails.edit.save')}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </form>
    </div>
  );
}
