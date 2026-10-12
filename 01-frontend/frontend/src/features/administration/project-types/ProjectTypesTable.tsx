import type { ProjectTypeResponse } from '@/api-clients/backend';
import { Badge } from '@/features/ui/badge/Badge';
import { Button } from '@/features/ui/button/Button';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

import { ProjectTypesRowActions } from './ProjectTypesRowActions';

type ProjectTypesTableProps = {
  projectTypes: ProjectTypeResponse[];
  isTogglePending: boolean;
  onRename: (projectType: ProjectTypeResponse) => void;
  onDuplicate: (projectType: ProjectTypeResponse) => void;
  onToggleActive: (projectType: ProjectTypeResponse) => void;
  onDelete: (projectType: ProjectTypeResponse) => void;
};

export function ProjectTypesTable(props: ProjectTypesTableProps) {
  const {
    projectTypes,
    isTogglePending,
    onRename,
    onDuplicate,
    onToggleActive,
    onDelete,
  } = props;
  const { t } = useTranslation('Administration');

  return (
    <div
      className="overflow-x-auto rounded-lg border border-border-primary"
      role="region"
      aria-label={t('projectTypes.tableAriaLabel')}
      tabIndex={0}
    >
      <table className="w-full min-w-[480px]">
        <thead>
          <tr className="border-b border-border-primary bg-bg-secondary">
            <th className="px-3 py-[11px] text-left text-sm font-medium tracking-tight text-text-primary">
              {t('projectTypes.tableHeaders.name')}
            </th>
            <th className="w-28 px-3 py-[11px] text-left text-sm font-medium tracking-tight text-text-primary">
              {t('projectTypes.tableHeaders.status')}
            </th>
            <th
              className="w-44 p-2"
              aria-label={t('projectTypes.tableHeaders.action')}
            />
          </tr>
        </thead>
        <tbody>
          {projectTypes.map((projectType) => (
            <tr
              key={projectType.id}
              className="border-b border-border-primary last:border-b-0"
            >
              <td className="px-3 py-[11px] text-sm text-text-primary">
                <Link
                  to="/administration/$projectTypeId"
                  params={{ projectTypeId: projectType.id }}
                  preload="intent"
                  className="focus-ring inline-flex rounded-sm font-medium hover:underline"
                >
                  {projectType.name}
                </Link>
              </td>
              <td className="w-28 px-3 py-[11px]">
                {projectType.active ? null : (
                  <Badge variant="secondary" size="small">
                    {t('projectTypes.inactiveBadge')}
                  </Badge>
                )}
              </td>
              <td className="w-44 p-2">
                <div className="flex items-center justify-end gap-1">
                  <Button asChild size="sm" variant="ghost">
                    <Link
                      to="/administration/$projectTypeId"
                      params={{ projectTypeId: projectType.id }}
                      preload="intent"
                    >
                      {t('projectTypes.actions.edit')}
                    </Link>
                  </Button>
                  <ProjectTypesRowActions
                    projectType={projectType}
                    isTogglePending={isTogglePending}
                    onRename={onRename}
                    onDuplicate={onDuplicate}
                    onToggleActive={onToggleActive}
                    onDelete={onDelete}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
