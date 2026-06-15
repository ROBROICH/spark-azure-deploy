import { StatusBadge } from '@/features/ui/status-badge/StatusBadge';
import { useTranslation } from 'react-i18next';
import type { TeamMember } from './team-member.types';

export type TeamMemberReadRowProps = {
  assignedTopicNames: string[];
  member: TeamMember;
};

export function TeamMemberReadRow(props: TeamMemberReadRowProps) {
  const { assignedTopicNames, member } = props;
  const { t } = useTranslation('Project');

  return (
    <>
      <td className="px-3 py-[11px] align-top text-sm tracking-tight text-text-secondary">
        {member.name}
      </td>
      <td className="px-3 py-[11px] align-top text-sm tracking-tight text-text-secondary">
        {t(`Team.roles.${member.role}`)}
      </td>
      <td className="px-3 py-2 align-top text-sm tracking-tight text-text-secondary">
        {assignedTopicNames.length > 0 ? (
          <div className="flex w-[26rem] max-w-full flex-wrap gap-1">
            {assignedTopicNames.map((topicName) => (
              <StatusBadge key={topicName} variant="neutral">
                {topicName}
              </StatusBadge>
            ))}
          </div>
        ) : (
          '—'
        )}
      </td>
    </>
  );
}
