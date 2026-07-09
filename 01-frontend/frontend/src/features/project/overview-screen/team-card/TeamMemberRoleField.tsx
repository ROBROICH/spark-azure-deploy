import { Field, FieldError, FieldLabel } from '@/features/ui/form/field';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';
import { useTranslation } from 'react-i18next';

import type { TeamMemberRole } from './team-member.types';

type TeamMemberFieldError = { message?: string } | undefined;

type TeamMemberRoleFieldApi = {
  handleBlur: () => void;
  handleChange: (value: TeamMemberRole) => void;
  name: string;
  state: {
    meta: {
      errors: TeamMemberFieldError[];
    };
    value: TeamMemberRole;
  };
};

type TeamMemberRoleFieldProps = {
  field: TeamMemberRoleFieldApi;
  labelId: string;
};

export function TeamMemberRoleField(props: TeamMemberRoleFieldProps) {
  const { field, labelId } = props;
  const { t } = useTranslation('Project');
  const isInvalid = field.state.meta.errors.length > 0;
  const errorId = `${field.name}-error`;

  return (
    <Field data-invalid={isInvalid || undefined}>
      <FieldLabel id={labelId} htmlFor={field.name}>
        {t('Team.form.role')}*
      </FieldLabel>
      <SelectMenu
        id={field.name}
        items={[
          { value: 'member', label: t('Team.roles.member') },
          { value: 'owner', label: t('Team.roles.owner') },
        ]}
        value={field.state.value}
        onChange={(value) => field.handleChange(value as TeamMemberRole)}
        onBlur={field.handleBlur}
        invalid={isInvalid}
        triggerClassName="w-full"
        required
        ariaLabelledBy={labelId}
        ariaDescribedby={isInvalid ? errorId : undefined}
      />
      {isInvalid ? (
        <FieldError id={errorId} errors={field.state.meta.errors} />
      ) : null}
    </Field>
  );
}
