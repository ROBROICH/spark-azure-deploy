import type { ProjectTypeResponse } from '@/api-clients/backend';
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Button } from '@/features/ui/button/Button';
import { EllipsisVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export type ProjectTypesRowActionsProps = {
  projectType: ProjectTypeResponse;
  isTogglePending: boolean;
  onRename: (projectType: ProjectTypeResponse) => void;
  onDuplicate: (projectType: ProjectTypeResponse) => void;
  onToggleActive: (projectType: ProjectTypeResponse) => void;
  onDelete: (projectType: ProjectTypeResponse) => void;
};

export function ProjectTypesRowActions(props: ProjectTypesRowActionsProps) {
  const {
    projectType,
    isTogglePending,
    onRename,
    onDuplicate,
    onToggleActive,
    onDelete,
  } = props;
  const { t } = useTranslation('Administration');

  return (
    <ActionMenu>
      <ActionMenuTrigger asChild>
        <Button
          type="button"
          size="xs"
          iconOnly
          variant="ghost-light"
          disabled={isTogglePending}
          aria-label={t('projectTypes.actions.menu', {
            name: projectType.name,
          })}
        >
          <EllipsisVertical aria-hidden />
        </Button>
      </ActionMenuTrigger>
      <ActionMenuContent align="end">
        <ActionMenuItem onSelect={() => onRename(projectType)}>
          {t('projectTypes.actions.rename')}
        </ActionMenuItem>
        <ActionMenuItem onSelect={() => onDuplicate(projectType)}>
          {t('projectTypes.actions.duplicate')}
        </ActionMenuItem>
        <ActionMenuItem
          disabled={isTogglePending}
          onSelect={() => onToggleActive(projectType)}
        >
          {projectType.active
            ? t('projectTypes.actions.deactivate')
            : t('projectTypes.actions.reactivate')}
        </ActionMenuItem>
        <ActionMenuItem
          variant="destructive"
          onSelect={() => onDelete(projectType)}
        >
          {t('projectTypes.actions.delete')}
        </ActionMenuItem>
      </ActionMenuContent>
    </ActionMenu>
  );
}
