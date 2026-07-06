import type { NodePayloadByType } from '@/db/nodes/types';
import { Field, FieldLabel } from '@/features/ui/form/field';
import { Input } from '@/features/ui/input/Input';
import { Dialog } from '@/features/ui/dialog/Dialog';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import type { TeamMember, TeamMemberRole } from './team-member.types';
import { TeamMemberDialogContent } from './TeamMemberDialogContent';
import { TeamMemberDialogFooter } from './TeamMemberDialogFooter';
import { TeamMemberRoleField } from './TeamMemberRoleField';
import { createTeamMemberDialogOpenChangeHandler } from './team-member-dialog-open-change';
import {
  createTeamMemberTopicIdsSchema,
  teamMemberRoleSchema,
} from './team-member-dialog.schema';
import { TeamMemberTopicAssignmentField } from './TeamMemberTopicAssignmentField';

const EDIT_TEAM_MEMBER_FORM_ID = 'edit-team-member-form';
const EDIT_TEAM_MEMBER_ROLE_LABEL_ID = `${EDIT_TEAM_MEMBER_FORM_ID}-role-label`;

const createEditTeamMemberSchema = (
  getMessage: (key: string) => string,
  topicIds: string[],
) =>
  z.object({
    role: teamMemberRoleSchema,
    topicIds: createTeamMemberTopicIdsSchema(getMessage, topicIds),
  });

export type EditTeamMemberDialogProps = {
  member: TeamMember;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTopicIds: string[];
  topics: NodePayloadByType<'topic'>[];
  onSave: (values: {
    role: TeamMemberRole;
    topicIds: string[];
  }) => Promise<void>;
};

/** Renders the validated team-member edit dialog and keeps topic picker errors field-scoped. */
export function EditTeamMemberDialog(props: EditTeamMemberDialogProps) {
  const { member, onOpenChange, onSave, open, selectedTopicIds, topics } =
    props;
  const { t } = useTranslation('Project');
  const getTeamFormMessage = (key: string) => t(`Team.form.${key}`);
  const schema = createEditTeamMemberSchema(
    getTeamFormMessage,
    topics.map((topic) => topic.id),
  );

  const form = useForm({
    defaultValues: {
      role: member.role,
      topicIds: selectedTopicIds,
    },
    validators: { onSubmit: schema },
    onSubmit: async (submitContext) => {
      const { value } = submitContext;

      await onSave({
        role: value.role,
        topicIds: value.topicIds,
      });
      onOpenChange(false);
    },
  });

  const handleOpenChange = createTeamMemberDialogOpenChangeHandler({
    onOpenChange,
    resetForm: form.reset,
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <TeamMemberDialogContent
        title={t('Team.editDialog.title')}
        formId={EDIT_TEAM_MEMBER_FORM_ID}
        onSubmit={() => void form.handleSubmit()}
        footer={
          <form.Subscribe selector={(state) => state.isSubmitting}>
            {(isSubmitting) => (
              <TeamMemberDialogFooter
                cancelLabel={t('Team.editDialog.cancel')}
                formId={EDIT_TEAM_MEMBER_FORM_ID}
                isSubmitting={isSubmitting}
                saveLabel={t('Team.editDialog.save')}
              />
            )}
          </form.Subscribe>
        }
      >
        <Field>
          <FieldLabel htmlFor="team-member-name">
            {t('Team.form.name')}
          </FieldLabel>
          <Input id="team-member-name" value={member.name} disabled readOnly />
        </Field>
        <form.Field name="role">
          {(field) => (
            <TeamMemberRoleField
              field={field}
              labelId={EDIT_TEAM_MEMBER_ROLE_LABEL_ID}
            />
          )}
        </form.Field>
        <form.Field name="topicIds">
          {(field) => (
            <TeamMemberTopicAssignmentField field={field} topics={topics} />
          )}
        </form.Field>
      </TeamMemberDialogContent>
    </Dialog>
  );
}
