import type { WorkflowsBase } from '@/api-clients/temporal-jobs-module/types.gen';
import { Button } from '@/features/ui/button/Button';
import { StatusBadge } from '@/features/ui/status-badge/StatusBadge';
import { ExternalLink } from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import {
  WORKFLOW_STATUS_BADGE_VARIANT,
  WORKFLOW_STATUS_LABEL_KEY,
  formatWorkflowDuration,
  formatWorkflowTimestamp,
  getTemporalWorkflowTimelineUrl,
  getWorkflowBadgeStatus,
  getWorkflowDurationMs,
  getWorkflowNameLabelKey,
  isWorkflowRunning,
} from './workflowCardDisplay';

type RunningWorkflowRunRowProps = {
  workflow: WorkflowsBase;
  dateLocale: string;
  fallbackValue: string;
  now: number;
};

export const RunningWorkflowRunRow = (props: RunningWorkflowRunRowProps) => {
  const { workflow, dateLocale, fallbackValue, now } = props;
  const { t } = useTranslation('Project');
  const badgeStatus = getWorkflowBadgeStatus(workflow);
  const workflowDisplayName = t(getWorkflowNameLabelKey(workflow));
  const workflowDuration = formatWorkflowDuration(
    getWorkflowDurationMs({
      workflow,
      isRunning: isWorkflowRunning(workflow),
      now,
    }),
    fallbackValue,
  );

  const handleOpenTemporalClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    window.open(
      getTemporalWorkflowTimelineUrl(workflow),
      '_blank',
      'noopener,noreferrer',
    );
  };

  return (
    <div className="flex items-start gap-2 rounded-md border border-border-primary bg-neutral-white px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="truncate text-xs font-medium text-text-primary"
            title={workflowDisplayName}
          >
            {workflowDisplayName}
          </span>
          <StatusBadge
            variant={WORKFLOW_STATUS_BADGE_VARIANT[badgeStatus]}
            size="default"
          >
            {t(WORKFLOW_STATUS_LABEL_KEY[badgeStatus])}
          </StatusBadge>
        </div>
        <p className="mt-1 text-xs text-text-secondary">
          {formatWorkflowTimestamp(
            workflow.workflow_start_time,
            dateLocale,
            fallbackValue,
          )}
          {' · '}
          {workflowDuration}
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        iconOnly
        onClick={handleOpenTemporalClick}
        aria-label={t('Sidebar.runningWorkflowsPanel.openTemporalAria', {
          name: workflow.workflow_id || workflowDisplayName,
        })}
        title={t('Sidebar.runningWorkflowsPanel.openTemporal')}
      >
        <ExternalLink className="size-4" />
      </Button>
    </div>
  );
};
