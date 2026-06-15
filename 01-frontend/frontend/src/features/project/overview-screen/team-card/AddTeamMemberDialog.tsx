import type { NodePayloadByType } from '@/db/nodes/types';
import type { UserPickerOption } from '@/features/ui/user-picker/UserPicker';
import { UserPicker } from '@/features/ui/user-picker/UserPicker';
import { Field, FieldError, FieldLabel } from '@/features/ui/form/field';
import { Dialog } from '@/features/ui/dialog/Dialog';
import { useForm } from '@tanstack/react-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import type { TeamMemberRole } from './team-member.types';
import { TeamMemberDialogContent } from './TeamMemberDialogContent';
import { TeamMemberDialogFooter } from './TeamMemberDialogFooter';
import { TeamMemberRoleField } from './TeamMemberRoleField';
import { createTeamMemberDialogOpenChangeHandler } from './team-member-dialog-open-change';
import {
  createTeamMemberTopicIdsSchema,
  teamMemberRoleSchema,
} from './team-member-dialog.schema';
import { TeamMemberTopicAssignmentField } from './TeamMemberTopicAssignmentField';

const ADD_TEAM_MEMBER_FORM_ID = 'add-team-member-form';

const createAddTeamMemberSchema = (
  getMessage: (key: string) => string,
  topicIds: string[],
) =>
  z.object({
    userIds: z.array(z.string()).min(1, getMessage('fieldRequired')),
    role: teamMemberRoleSchema,
    topicIds: createTeamMemberTopicIdsSchema(getMessage, topicIds),
  });

export type AddTeamMemberDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topics: NodePayloadByType<'topic'>[];
  users: UserPickerOption[];
  onAdd: (values: {
    userIds: string[];
    role: TeamMemberRole;
    topicIds: string[];
  }) => Promise<void>;
};

/**
 * Keeps selected users in the dialog until the async team mutation succeeds.
 */
export function AddTeamMemberDialog(props: AddTeamMemberDialogProps) {
  const { open, onOpenChange, onAdd, topics, users } = props;
  const { t } = useTranslation('Project');
  const getTeamFormMessage = (key: string) => t(`Team.form.${key}`);
  const schema = createAddTeamMemberSchema(
    getTeamFormMessage,
    topics.map((topic) => topic.id),
  );

  const form = useForm({
    defaultValues: {
      userIds: [] as string[],
      role: 'member' as TeamMemberRole,
      topicIds: [] as string[],
    },
    validators: { onSubmit: schema },
    onSubmit: async (submitContext) => {
      const { value } = submitContext;

      await onAdd({
        userIds: value.userIds,
        role: value.role,
        topicIds: value.topicIds,
      });
      form.reset();
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
        title={t('Team.createDialog.title')}
        formId={ADD_TEAM_MEMBER_FORM_ID}
        onSubmit={() => void form.handleSubmit()}
        footer={
          <form.Subscribe
            selector={(state) => ({
              userIds: state.values.userIds,
              isSubmitting: state.isSubmitting,
            })}
          >
            {(state) => (
              <TeamMemberDialogFooter
                cancelLabel={t('Team.createDialog.cancel')}
                formId={ADD_TEAM_MEMBER_FORM_ID}
                isSubmitting={state.isSubmitting}
                saveLabel={t('Team.createDialog.save')}
                submitDisabled={state.userIds.length === 0}
              />
            )}
          </form.Subscribe>
        }
      >
        <form.Field name="userIds">
          {(field) => {
            const isInvalid = field.state.meta.errors.length > 0;
            const errorId = `${field.name}-error`;

            return (
              <Field data-invalid={isInvalid || undefined}>
                <FieldLabel htmlFor={field.name}>
                  {t('Team.form.selectUsers')}*
                </FieldLabel>
                <UserPicker
                  id={field.name}
                  users={users}
                  value={field.state.value}
                  onChange={field.handleChange}
                  onBlur={field.handleBlur}
                  label={t('Team.form.selectUsers')}
                  placeholder={t('Team.form.selectUsers')}
                  emptyLabel={t('Team.userPicker.empty')}
                  invalid={isInvalid}
                  aria-describedby={isInvalid ? errorId : undefined}
                  selectedCountLabel={(count) =>
                    t('Team.userPicker.selectedCount', { count })
                  }
                />
                {isInvalid ? (
                  <FieldError id={errorId} errors={field.state.meta.errors} />
                ) : null}
              </Field>
            );
          }}
        </form.Field>
        <form.Field name="role">
          {(field) => <TeamMemberRoleField field={field} />}
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
