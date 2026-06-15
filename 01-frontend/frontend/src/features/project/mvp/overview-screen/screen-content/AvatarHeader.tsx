import { AvatarBand } from '@/features/ui/avatar-band/AvatarBand';
import { Button } from '@/features/ui/button/Button';
import { UserPicker } from '@/features/ui/user-picker/UserPicker';
import { Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjectAssignedUsers } from '../screen-data/useProjectAssignedUsers';
import {
  sortUserIdsByUserOrder,
  toAvatarBandUser,
  toUserPickerOptions,
} from './userPickerOptions';

type AvatarHeaderProps = {
  assignedUserIds: string[];
  disabled?: boolean;
  onChange: (assignedUserIds: string[]) => void;
};

const MAX_TOPIC_ASSIGNEES = 7;

export function AvatarHeader(props: AvatarHeaderProps) {
  const { assignedUserIds, disabled = false, onChange } = props;
  const { t } = useTranslation('MaterialCompletenessCheck');
  const { hasProjectUser, isOrganizationUsersError, projectUsers } =
    useProjectAssignedUsers();
  const isPickerDisabled = disabled || isOrganizationUsersError;
  const usersById = new Map(projectUsers.map((user) => [user.userId, user]));
  const visibleAssignedUserIds = sortUserIdsByUserOrder(
    assignedUserIds.filter((userId) => hasProjectUser(userId)),
    projectUsers,
  ).slice(0, MAX_TOPIC_ASSIGNEES);
  const assignedUsers = visibleAssignedUserIds.flatMap((userId) => {
    const user = usersById.get(userId);

    return user ? [toAvatarBandUser(user)] : [];
  });

  return (
    <div className="flex min-w-0 items-center gap-1">
      {isOrganizationUsersError && assignedUserIds.length > 0 ? (
        <span className="text-body-s text-text-error">
          {t('TopicWorkflow.overviewCard.assignment.peopleUnavailable')}
        </span>
      ) : (
        <AvatarBand
          users={assignedUsers}
          getToggleLabel={(toggleState) => {
            const { isPinned, user } = toggleState;

            return t(
              isPinned
                ? 'TopicWorkflow.overviewCard.assignment.unpinPersonDetails'
                : 'TopicWorkflow.overviewCard.assignment.pinPersonDetails',
              { email: user.email, name: user.name },
            );
          }}
          getOverflowLabel={(count) =>
            t('TopicWorkflow.overviewCard.assignment.moreEditors', { count })
          }
        />
      )}
      <UserPicker
        users={toUserPickerOptions(projectUsers)}
        value={visibleAssignedUserIds}
        onChange={(nextAssignedUserIds) =>
          onChange(sortUserIdsByUserOrder(nextAssignedUserIds, projectUsers))
        }
        maxSelected={MAX_TOPIC_ASSIGNEES}
        emptyLabel={t('TopicWorkflow.overviewCard.assignment.empty')}
        disabled={isPickerDisabled}
        trigger={
          <Button
            type="button"
            variant="ghost-light"
            iconOnly
            size="xs"
            aria-label={t('TopicWorkflow.overviewCard.assignment.edit')}
            disabled={isPickerDisabled}
          >
            <Plus aria-hidden />
          </Button>
        }
      />
    </div>
  );
}
