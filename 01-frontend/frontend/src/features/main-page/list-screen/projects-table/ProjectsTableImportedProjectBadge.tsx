import { StatusBadge } from '@/features/ui/status-badge/StatusBadge';
import { useTranslation } from 'react-i18next';

export function ProjectsTableImportedProjectBadge() {
  const { t } = useTranslation('shared');
  const label = t('importedProjectBadge.label');
  const tooltip = t('importedProjectBadge.tooltip');

  return (
    <span
      role="img"
      aria-label={`${label}: ${tooltip}`}
      className="inline-flex rounded-sm"
    >
      <StatusBadge variant="default">{label}</StatusBadge>
    </span>
  );
}
