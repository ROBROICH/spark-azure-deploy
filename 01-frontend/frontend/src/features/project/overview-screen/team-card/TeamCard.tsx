import { replaceProjectAssignmentsAssignProjectsProjectIdAssignmentsPostMutation } from '@/api-clients/identity-management-module/@tanstack/react-query.gen';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useLiveNodes } from '@/db/nodes/hooks/useLiveNodes';
import { useOrganizationUsers } from '@/features/access-control/organization-users/organizationUsers.collection';
import {
  getOrganizationUserDisplayName,
  sortOrganizationUsersByName,
} from '@/features/access-control/organization-users/organizationUser.utils';
import {
  projectsCollection,
  useProject,
} from '@/features/project/data/collections/projects.collection';
import {
  replaceProjectAssignmentRelation,
  toProjectAssignmentsRequest,
} from '@/features/access-control/project-assignments/projectAssignment.utils';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import {
  createHandledMutationError,
  showMutationErrorToast,
} from '@/integrations/api-clients/mutationErrorToast';
import { toast } from '@/features/ui/toast/Toast';
import { useAction } from '@/db/nodes/hooks/useAction';
import { useMutation } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { TeamMember, TeamMemberRole } from './team-member.types';
import {
  createTeamMembers,
  getTeamMemberIdsForRole,
} from './team-member.utils';
import { getTopicAssigneeUpdate } from './team-topic-assignment.utils';
import { TeamCardDialogs } from './TeamCardDialogs';
import { TeamCardSection } from './TeamCardSection';

type ProjectAssignments = { owners: string[]; members: string[] };
type TopicAssignments = { userIds: string[]; topicIds: string[] };
type AddTeamMemberValues = TopicAssignments & { role: TeamMemberRole };
type EditTeamMemberValues = { role: TeamMemberRole; topicIds: string[] };

const route = getRouteApi('/verfahren/$verfahrenId/');

/** Coordinates project relation mutations, topic assignments, and team dialogs. */
export const TeamCard = () => {
  const { t } = useTranslation('Project');
  const { verfahrenId } = route.useParams();
  const { canMutateProject } = useCanMutateProject({
    requiredLevel: 'owner',
  });
  const { getNodesByType } = useGraph();
  const topicRefs = getNodesByType('topic').map((topic) => ({
    id: topic.id,
    node_type: topic.node_type,
  }));
  const { data: topics, isLoading: areTopicsLoading } = useLiveNodes(topicRefs);
  const { transact, update } = useAction();

  const {
    data: project,
    isLoading: isProjectLoading,
    isError: isProjectError,
  } = useProject(verfahrenId);
  const usersQuery = useOrganizationUsers();
  const replaceProjectAssignmentsMutation = useMutation(
    replaceProjectAssignmentsAssignProjectsProjectIdAssignmentsPostMutation(),
  );

  const owners = project?.owners ?? [];
  const members = project?.members ?? [];
  // Team saves replace project assignments; never mutate from an empty fallback
  // when the project snapshot is still missing or failed to load.
  const canEditTeam =
    canMutateProject &&
    project !== null &&
    !isProjectLoading &&
    !isProjectError &&
    !areTopicsLoading &&
    !usersQuery.isLoading &&
    !usersQuery.isError;
  const teamMembers = createTeamMembers({
    owners,
    members,
    users: usersQuery.data,
  });
  const teamUserIds = new Set([...owners, ...members]);
  const userOptions = sortOrganizationUsersByName(usersQuery.data).map(
    (user) => {
      const label = getOrganizationUserDisplayName(user) ?? user.email;

      return {
        id: user.userId,
        label,
        description: label === user.email ? undefined : user.email,
        disabled: teamUserIds.has(user.userId),
      };
    },
  );
  const hasRequiredUsers = usersQuery.data.length > 0;

  const [isCreateOpen, setIsCreateOpen] =
    // eslint-disable-next-line no-restricted-syntax -- ephemeral UI toggle for create dialog
    useState(false);

  const [editingMember, setEditingMember] =
    // eslint-disable-next-line no-restricted-syntax -- ephemeral UI state for edit dialog target
    useState<TeamMember | null>(null);

  const [deletingMember, setDeletingMember] =
    // eslint-disable-next-line no-restricted-syntax -- ephemeral UI state for delete confirmation target
    useState<TeamMember | null>(null);

  const reloadProject = async () => {
    await projectsCollection.utils.refetchProject(verfahrenId);
  };

  const replaceProjectAssignments = async (assignments: ProjectAssignments) => {
    const response = await replaceProjectAssignmentsMutation.mutateAsync({
      path: { project_id: verfahrenId },
      body: toProjectAssignmentsRequest(assignments),
    });

    if (response.success !== true) {
      throw new Error('Project assignment update failed');
    }
  };

  const replaceUserTopicAssignments = async (params: TopicAssignments) => {
    const selectedTopicIds = new Set(params.topicIds);
    const editedUserIds = new Set(params.userIds);
    const tx = transact(() => {
      for (const topic of topics) {
        const assigneeUpdate = getTopicAssigneeUpdate({
          editedUserIds,
          selectedTopicIds,
          topic,
          userIds: params.userIds,
        });

        if (!assigneeUpdate) {
          continue;
        }

        update(topic, (draft) => {
          draft.mvp_assignees = assigneeUpdate.mvpAssignees;
          draft.updated_at = new Date().toISOString();
        });
      }
    });

    await tx.isPersisted.promise;
  };

  const handleAdd = async (values: AddTeamMemberValues) => {
    if (!canEditTeam) {
      return;
    }

    try {
      await replaceProjectAssignments(
        replaceProjectAssignmentRelation({
          assignments: { owners, members },
          relation: values.role,
          value: getTeamMemberIdsForRole({
            owners,
            members,
            role: values.role,
            userIds: values.userIds,
          }),
        }),
      );
      await replaceUserTopicAssignments({
        userIds: values.userIds,
        topicIds: values.topicIds,
      });
      await reloadProject();
      toast.success(t('Team.userPicker.addSuccess'));
    } catch (error) {
      showMutationErrorToast({
        error,
        fallbackMessage: t('Team.userPicker.saveError'),
      });
      throw createHandledMutationError('Failed to add team member', error);
    }
  };

  /** Persists team-member removal and keeps the delete dialog open on failed saves. */
  const handleDelete = async () => {
    if (!deletingMember || !canEditTeam) {
      return;
    }

    try {
      await replaceProjectAssignments(
        replaceProjectAssignmentRelation({
          assignments: { owners, members },
          relation: deletingMember.role,
          value:
            deletingMember.role === 'owner'
              ? owners.filter((userId) => userId !== deletingMember.id)
              : members.filter((userId) => userId !== deletingMember.id),
        }),
      );
      await replaceUserTopicAssignments({
        userIds: [deletingMember.id],
        topicIds: [],
      });
      await reloadProject();
      toast.success(t('Team.userPicker.deleteSuccess'));
      setDeletingMember(null);
    } catch (error) {
      showMutationErrorToast({
        error,
        fallbackMessage: t('Team.userPicker.saveError'),
        statusMessages: {
          400: t('Team.userPicker.lastOwnerRemoveError'),
        },
      });
      throw createHandledMutationError('Failed to delete team member', error);
    }
  };

  /** Persists the edited member role and topic assignments through one guarded save flow. */
  const handleEditSave = async (values: EditTeamMemberValues) => {
    if (!canEditTeam || !editingMember) {
      setEditingMember(null);
      return;
    }

    const isOwnerDemotion =
      editingMember.role === 'owner' && values.role === 'member';

    try {
      if (editingMember.role !== values.role) {
        await replaceProjectAssignments(
          replaceProjectAssignmentRelation({
            assignments: { owners, members },
            relation: values.role,
            value: getTeamMemberIdsForRole({
              owners,
              members,
              role: values.role,
              userIds: [editingMember.id],
            }),
          }),
        );
      }
      await replaceUserTopicAssignments({
        userIds: [editingMember.id],
        topicIds: values.topicIds,
      });
      await reloadProject();
      toast.success(t('Team.userPicker.updateSuccess'));
      setEditingMember(null);
    } catch (error) {
      showMutationErrorToast({
        error,
        fallbackMessage: t('Team.userPicker.saveError'),
        statusMessages: isOwnerDemotion
          ? {
              400: t('Team.userPicker.lastOwnerRemoveError'),
            }
          : undefined,
      });
      throw createHandledMutationError('Failed to update team member', error);
    }
  };

  return (
    <>
      <TeamCardSection
        canEditTeam={canEditTeam}
        canMutateProject={canMutateProject}
        hasRequiredUsers={hasRequiredUsers}
        isProjectError={isProjectError}
        isUsersError={usersQuery.isError}
        teamMembers={teamMembers}
        topics={topics}
        onCreateOpen={() => {
          if (!canEditTeam || !hasRequiredUsers) {
            return;
          }

          setIsCreateOpen(true);
        }}
        onEdit={setEditingMember}
        onDelete={setDeletingMember}
      />
      <TeamCardDialogs
        canEditTeam={canEditTeam}
        deletingMember={deletingMember}
        editingMember={editingMember}
        hasRequiredUsers={hasRequiredUsers}
        isCreateOpen={isCreateOpen}
        topics={topics}
        users={userOptions}
        onAdd={handleAdd}
        onConfirmDelete={handleDelete}
        onCreateOpenChange={setIsCreateOpen}
        onDeleteOpenChange={(open) => {
          if (!open) {
            setDeletingMember(null);
          }
        }}
        onEditOpenChange={(open) => {
          if (!open) {
            setEditingMember(null);
          }
        }}
        onEditSave={handleEditSave}
      />
    </>
  );
};
