import type { IdentityResponse } from '@/api-clients/backend';
import { getOrganizationUserDisplayName } from '@/features/access-control/organization-users/organizationUser.utils';
import {
  AvatarBand,
  type AvatarBandToggleLabelParams,
  type AvatarBandUser,
} from '@/features/ui/avatar-band/AvatarBand';
import type { CellContext } from '@tanstack/react-table';
import type { TFunction } from 'i18next';
import type { Project } from '../../data/schemas/project.schema';

type ProjectOwnersCellLabels = {
  peopleUnavailable: string;
};

function createProjectAvatarUsers(params: {
  project: Project;
  usersById: Map<string, IdentityResponse>;
}) {
  const { project, usersById } = params;
  const toAvatarBandUser = (userId: string): AvatarBandUser | null => {
    const user = usersById.get(userId);

    if (!user) {
      return null;
    }

    return {
      id: user.userId,
      name: getOrganizationUserDisplayName(user) ?? user.email,
      email: user.email,
    };
  };

  return project.owners.flatMap((userId) => {
    const avatarUser = toAvatarBandUser(userId);

    return avatarUser ? [avatarUser] : [];
  });
}

function renderProjectOwnersCell(params: {
  getToggleLabel: (labelParams: AvatarBandToggleLabelParams) => string;
  getOverflowLabel: (count: number) => string;
  isError: boolean;
  labels: ProjectOwnersCellLabels;
  project: Project;
  usersById: Map<string, IdentityResponse>;
}) {
  const {
    getToggleLabel,
    getOverflowLabel,
    isError,
    labels,
    project,
    usersById,
  } = params;
  const ownerIds = project.owners;

  if (ownerIds.length === 0) {
    return (
      <AvatarBand
        users={[]}
        getToggleLabel={getToggleLabel}
        getOverflowLabel={getOverflowLabel}
      />
    );
  }

  if (isError) {
    return (
      <span className="text-body-s text-text-error">
        {labels.peopleUnavailable}
      </span>
    );
  }

  const avatarUsers = createProjectAvatarUsers({
    project,
    usersById,
  });

  return (
    <AvatarBand
      users={avatarUsers}
      getToggleLabel={getToggleLabel}
      getOverflowLabel={getOverflowLabel}
    />
  );
}

/**
 * Builds the verfahrensleitung (project owners) cell renderer with localized
 * pin/overflow labels and a fail-soft message when organization users fail to load.
 */
export const createProjectOwnersColumnCell = (params: {
  t: TFunction<'Dashboard'>;
  usersById: Map<string, IdentityResponse>;
  usersIsError: boolean;
}) => {
  const { t, usersById, usersIsError } = params;

  return (ctx: CellContext<Project, unknown>) =>
    renderProjectOwnersCell({
      getToggleLabel: ({ isPinned, user }) =>
        t(
          isPinned
            ? 'ProjectsTable.unpinPersonDetails'
            : 'ProjectsTable.pinPersonDetails',
          {
            email: user.email,
            name: user.name,
          },
        ),
      getOverflowLabel: (count) => t('ProjectsTable.moreEditors', { count }),
      isError: usersIsError,
      labels: {
        peopleUnavailable: t('ProjectsTable.peopleUnavailable'),
      },
      project: ctx.row.original,
      usersById,
    });
};
