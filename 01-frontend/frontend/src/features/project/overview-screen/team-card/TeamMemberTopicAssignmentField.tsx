import type { NodePayloadByType } from '@/db/nodes/types';
import { Field, FieldError, FieldLabel } from '@/features/ui/form/field';
import { useTranslation } from 'react-i18next';

import { TeamTopicAssignmentPicker } from './TeamTopicAssignmentPicker';

type TeamMemberFieldError = { message?: string } | undefined;

type TeamMemberTopicAssignmentFieldApi = {
  handleChange: (value: string[]) => void;
  name: string;
  state: {
    meta: {
      errors: TeamMemberFieldError[];
    };
    value: string[];
  };
};

type TeamMemberTopicAssignmentFieldProps = {
  field: TeamMemberTopicAssignmentFieldApi;
  topics: NodePayloadByType<'topic'>[];
};

export function TeamMemberTopicAssignmentField(
  props: TeamMemberTopicAssignmentFieldProps,
) {
  const { field, topics } = props;
  const { t } = useTranslation('Project');
  const isInvalid = field.state.meta.errors.length > 0;
  const errorId = `${field.name}-error`;
  const labelId = `${field.name}-label`;

  return (
    <Field data-invalid={isInvalid || undefined}>
      <FieldLabel id={labelId}>{t('Team.form.topic')}</FieldLabel>
      <TeamTopicAssignmentPicker
        labelId={labelId}
        topics={topics}
        value={field.state.value}
        onChange={field.handleChange}
        invalid={isInvalid}
        aria-describedby={isInvalid ? errorId : undefined}
      />
      {isInvalid ? (
        <FieldError id={errorId} errors={field.state.meta.errors} />
      ) : null}
    </Field>
  );
}
