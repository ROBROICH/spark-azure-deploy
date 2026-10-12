import type { NodePayloadByType } from '@/db/nodes/types';
import { useTranslation } from 'react-i18next';

import type { TeamMember } from './team-member.types';
import { TeamMemberActions } from './TeamMemberActions';
import { TeamMemberReadRow } from './TeamMemberReadRow';

type TeamMembersTableProps = {
  canMutateProject: boolean;
  onDelete: (member: TeamMember) => void;
  onEdit: (member: TeamMember) => void;
  teamMembers: TeamMember[];
  topics: NodePayloadByType<'topic'>[];
};

const getAssignedTopicNamesByUserId = (params: {
  topics: NodePayloadByType<'topic'>[];
}) => {
  const assignedTopicNamesByUserId = new Map<string, string[]>();

  for (const topic of params.topics) {
    const assignedUserIds = new Set(topic.mvpAssignees);

    for (const userId of assignedUserIds) {
      const assignedTopicNames = assignedTopicNamesByUserId.get(userId) ?? [];
      assignedTopicNames.push(topic.name);
      assignedTopicNamesByUserId.set(userId, assignedTopicNames);
    }
  }

  return assignedTopicNamesByUserId;
};

export function TeamMembersTable(props: TeamMembersTableProps) {
  const { canMutateProject, onDelete, onEdit, teamMembers, topics } = props;
  const { t } = useTranslation('Project');
  const assignedTopicNamesByUserId = getAssignedTopicNamesByUserId({
    topics,
  });

  return (
    <div
      className="overflow-x-auto rounded-lg border border-border-primary"
      role="region"
      aria-label={t('Team.tableAriaLabel')}
      tabIndex={0}
    >
      <table className="w-full min-w-[480px]">
        <thead>
          <tr className="border-b border-border-primary bg-bg-secondary">
            <th className="px-3 py-[11px] text-left text-sm font-medium tracking-tight text-text-primary">
              {t('Team.tableHeaders.name')}
            </th>
            <th className="px-3 py-[11px] text-left text-sm font-medium tracking-tight text-text-primary">
              {t('Team.tableHeaders.role')}
            </th>
            <th className="px-3 py-[11px] text-left text-sm font-medium tracking-tight text-text-primary">
              {t('Team.tableHeaders.topic')}
            </th>
            {canMutateProject ? (
              <th
                className="w-10 p-2"
                aria-label={t('Team.tableHeaders.action')}
              />
            ) : null}
          </tr>
        </thead>
        <tbody>
          {teamMembers.map((member) => (
            <tr
              key={`${member.role}-${member.id}`}
              className="border-b border-border-primary last:border-b-0"
            >
              <TeamMemberReadRow
                assignedTopicNames={
                  assignedTopicNamesByUserId.get(member.id) ?? []
                }
                member={member}
              />
              {canMutateProject ? (
                <TeamMemberActions
                  member={member}
                  onEdit={onEdit}
                  onDelete={onDelete}
                />
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
