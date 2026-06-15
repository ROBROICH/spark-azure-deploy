import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Button } from '@/features/ui/button/Button';
import { EllipsisVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TeamMember } from './team-member.types';

type TeamMemberActionsProps = {
  member: TeamMember;
  onEdit: (member: TeamMember) => void;
  onDelete: (member: TeamMember) => void;
};

export function TeamMemberActions(props: TeamMemberActionsProps) {
  const { member, onDelete, onEdit } = props;
  const { t } = useTranslation('Project');

  return (
    <td className="w-10 p-2 align-top">
      <ActionMenu>
        <ActionMenuTrigger asChild>
          <Button
            type="button"
            size="xs"
            iconOnly
            variant="ghost-light"
            aria-label={t('Team.actionsMenu')}
          >
            <EllipsisVertical aria-hidden />
          </Button>
        </ActionMenuTrigger>
        <ActionMenuContent align="start">
          <ActionMenuItem onSelect={() => onEdit(member)}>
            {t('Team.actions.edit')}
          </ActionMenuItem>
          <ActionMenuItem
            variant="destructive"
            onSelect={() => onDelete(member)}
          >
            {t('Team.actions.delete')}
          </ActionMenuItem>
        </ActionMenuContent>
      </ActionMenu>
    </td>
  );
}
