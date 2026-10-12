import type { NodePayloadByType } from '@/db/nodes/types';
import { Button } from '@/features/ui/button/Button';
import { Plus, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import type { TeamMember } from './team-member.types';
import { TeamMembersTable } from './TeamMembersTable';

type TeamCardSectionProps = {
  canEditTeam: boolean;
  canMutateProject: boolean;
  hasRequiredUsers: boolean;
  isProjectError: boolean;
  isUsersError: boolean;
  onCreateOpen: () => void;
  onDelete: (member: TeamMember) => void;
  onEdit: (member: TeamMember) => void;
  teamMembers: TeamMember[];
  topics: NodePayloadByType<'topic'>[];
};

export function TeamCardSection(props: TeamCardSectionProps) {
  const {
    canEditTeam,
    canMutateProject,
    hasRequiredUsers,
    isProjectError,
    isUsersError,
    onCreateOpen,
    onDelete,
    onEdit,
    teamMembers,
    topics,
  } = props;
  const { t } = useTranslation('Project');

  return (
    <div className="mt-6 flex flex-col gap-4 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span aria-hidden className="rounded-lg bg-bg-quaternary p-2">
          <Users className="size-4" />
        </span>
        <h2 className="flex-1 text-base font-medium tracking-tight text-text-primary">
          {t('Team.title')}
        </h2>
        {canMutateProject ? (
          <Button
            variant="secondary"
            size="sm"
            withIcon
            type="button"
            disabled={!canEditTeam || !hasRequiredUsers}
            onClick={onCreateOpen}
          >
            <Plus aria-hidden />
            {t('Team.addButton')}
          </Button>
        ) : null}
      </div>

      {isUsersError ? (
        <p className="text-sm text-error-700">
          {t('Team.userPicker.loadError')}
        </p>
      ) : null}
      {isProjectError ? (
        <p className="text-sm text-error-700">{t('Team.projectLoadError')}</p>
      ) : null}

      {teamMembers.length === 0 ? (
        <p className="text-sm text-text-secondary">{t('Team.emptyState')}</p>
      ) : (
        <TeamMembersTable
          canMutateProject={canEditTeam}
          teamMembers={teamMembers}
          topics={topics}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
