import type { NodePayloadByType } from '@/db/nodes/types';

import { AddTeamMemberDialog } from './AddTeamMemberDialog';
import { DeleteTeamMemberDialog } from './DeleteTeamMemberDialog';
import { EditTeamMemberDialog } from './EditTeamMemberDialog';
import type { TeamMember, TeamMemberRole } from './team-member.types';
import { getAssignedTopicIds } from './team-topic-assignment.utils';

type AddTeamMemberValues = {
  role: TeamMemberRole;
  topicIds: string[];
  userIds: string[];
};
type EditTeamMemberValues = { role: TeamMemberRole; topicIds: string[] };

type TeamCardDialogsProps = {
  canEditTeam: boolean;
  deletingMember: TeamMember | null;
  editingMember: TeamMember | null;
  hasRequiredUsers: boolean;
  isCreateOpen: boolean;
  onAdd: (values: AddTeamMemberValues) => Promise<void>;
  onConfirmDelete: () => Promise<void>;
  onCreateOpenChange: (open: boolean) => void;
  onDeleteOpenChange: (open: boolean) => void;
  onEditOpenChange: (open: boolean) => void;
  onEditSave: (values: EditTeamMemberValues) => Promise<void>;
  topics: NodePayloadByType<'topic'>[];
  users: {
    description?: string;
    disabled: boolean;
    id: string;
    label: string;
  }[];
};

export function TeamCardDialogs(props: TeamCardDialogsProps) {
  const {
    canEditTeam,
    deletingMember,
    editingMember,
    hasRequiredUsers,
    isCreateOpen,
    onAdd,
    onConfirmDelete,
    onCreateOpenChange,
    onDeleteOpenChange,
    onEditOpenChange,
    onEditSave,
    topics,
    users,
  } = props;

  return (
    <>
      {canEditTeam && hasRequiredUsers ? (
        <AddTeamMemberDialog
          open={isCreateOpen}
          onOpenChange={onCreateOpenChange}
          users={users}
          topics={topics}
          onAdd={onAdd}
        />
      ) : null}

      {canEditTeam && editingMember ? (
        <EditTeamMemberDialog
          member={editingMember}
          selectedTopicIds={getAssignedTopicIds(topics, editingMember.id)}
          topics={topics}
          open
          onOpenChange={onEditOpenChange}
          onSave={onEditSave}
        />
      ) : null}

      {canEditTeam ? (
        <DeleteTeamMemberDialog
          open={deletingMember !== null}
          onOpenChange={onDeleteOpenChange}
          onConfirm={onConfirmDelete}
        />
      ) : null}
    </>
  );
}
