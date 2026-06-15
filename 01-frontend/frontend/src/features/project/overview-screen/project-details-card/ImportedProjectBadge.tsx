import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import {
  StatusBadge,
  type StatusBadgeSize,
} from '@/features/ui/status-badge/StatusBadge';
import { cn } from '@/features/ui/style/cn';
import { useTranslation } from 'react-i18next';

type ImportedProjectBadgeProps = {
  size?: StatusBadgeSize;
  className?: string;
};

export function ImportedProjectBadge(props: ImportedProjectBadgeProps) {
  const { size, className } = props;
  const { t } = useTranslation('shared');
  const label = t('importedProjectBadge.label');
  const tooltip = t('importedProjectBadge.tooltip');

  return (
    <TooltipWrapper content={tooltip}>
      <span
        role="img"
        aria-label={`${label}: ${tooltip}`}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- tooltip trigger anchor; role="img" is intentional for a status indicator, tabIndex makes it keyboard-reachable
        tabIndex={0}
        className={cn('focus-ring inline-flex rounded-sm', className)}
      >
        <StatusBadge variant="default" size={size}>
          {label}
        </StatusBadge>
      </span>
    </TooltipWrapper>
  );
}
