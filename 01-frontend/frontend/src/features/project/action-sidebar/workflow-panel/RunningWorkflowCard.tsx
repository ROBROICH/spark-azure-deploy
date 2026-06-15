import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/features/ui/collapsible/Collapsible';
import { Button } from '@/features/ui/button/Button';
import { StatusBadge } from '@/features/ui/status-badge/StatusBadge';
import {
  ChevronDown,
  ExternalLink,
  LoaderCircle,
  Workflow,
} from 'lucide-react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { WorkflowSummary } from '@/features/workflow-runtime/workflow-status/workflowStatus.types';
import { RunningWorkflowRunRow } from './RunningWorkflowRunRow';
import {
  WORKFLOW_STATUS_BADGE_VARIANT,
  WORKFLOW_STATUS_LABEL_KEY,
  formatWorkflowDuration,
  formatWorkflowTimestamp,
  getTemporalWorkflowTimelineUrl,
  getWorkflowDurationMs,
  getWorkflowNameLabelKey,
} from './workflowCardDisplay';

type RunningWorkflowCardProps = {
  workflowSummary: WorkflowSummary;
  dateLocale: string;
  now: number;
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
};

type WorkflowDetailRowProps = {
  label: string;
  value: string;
};

const WorkflowDetailRow = (props: WorkflowDetailRowProps) => {
  const { label, value } = props;

  return (
    <div className="grid gap-1 sm:grid-cols-[10rem,1fr] sm:gap-1">
      <dt className="text-[11px] font-medium text-text-secondary">{label}</dt>
      <dd className="min-w-0 text-[11px] break-all text-text-primary">
        {value}
      </dd>
    </div>
  );
};

export const RunningWorkflowCard = (props: RunningWorkflowCardProps) => {
  const { workflowSummary, dateLocale, now, isExpanded, onExpandedChange } =
    props;
  const { t } = useTranslation('Project');
  const workflowDisplayName = t(
    getWorkflowNameLabelKey(workflowSummary.workflow),
  );
  const fallbackValue = t('Sidebar.runningWorkflowsPanel.notAvailable');
  const temporalWorkflowTimelineUrl = getTemporalWorkflowTimelineUrl(
    workflowSummary.workflow,
  );
  const workflowDuration = formatWorkflowDuration(
    getWorkflowDurationMs({
      workflow: workflowSummary.workflow,
      isRunning: workflowSummary.isRunning,
      now,
    }),
    fallbackValue,
  );
  const durationLabel = workflowSummary.isRunning
    ? t('Sidebar.runningWorkflowsPanel.details.elapsedTime')
    : t('Sidebar.runningWorkflowsPanel.details.runTime');

  const handleOpenTemporalClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    window.open(temporalWorkflowTimelineUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={onExpandedChange}
      className="rounded-lg border border-border-primary bg-neutral-white"
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <CollapsibleTrigger className="focus-ring flex min-w-0 flex-1 cursor-pointer items-start gap-3 text-left">
          <ChevronDown className="mt-0.5 size-5 shrink-0 text-text-secondary transition-transform duration-200 [[data-state=closed]_&]:-rotate-90" />
          <div className="flex min-w-0 flex-1 items-start gap-2">
            {workflowSummary.isRunning ? (
              <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin text-text-ki" />
            ) : (
              <Workflow className="mt-0.5 size-4 shrink-0 text-text-secondary" />
            )}
            <div className="min-w-0 flex-1">
              <h4
                className="truncate text-sm font-medium text-text-primary"
                title={workflowDisplayName}
              >
                {workflowDisplayName}
              </h4>
              <p className="mt-1 text-[11px] text-text-secondary">
                {formatWorkflowTimestamp(
                  workflowSummary.workflow.workflow_start_time,
                  dateLocale,
                  fallbackValue,
                )}
              </p>
            </div>
          </div>
        </CollapsibleTrigger>

        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge
            variant={WORKFLOW_STATUS_BADGE_VARIANT[workflowSummary.badgeStatus]}
            size="default"
          >
            {t(WORKFLOW_STATUS_LABEL_KEY[workflowSummary.badgeStatus])}
          </StatusBadge>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            iconOnly
            onClick={handleOpenTemporalClick}
            aria-label={t('Sidebar.runningWorkflowsPanel.openTemporalAria', {
              name: workflowDisplayName,
            })}
            title={t('Sidebar.runningWorkflowsPanel.openTemporal')}
          >
            <ExternalLink className="size-4" />
          </Button>
        </div>
      </div>

      <CollapsibleContent className="bg-highlight-info border-t border-border-primary px-4 py-3">
        <dl className="flex flex-col gap-3">
          <WorkflowDetailRow
            label={t('Sidebar.runningWorkflowsPanel.details.workflowId')}
            value={workflowSummary.workflow.workflow_id}
          />
          <WorkflowDetailRow
            label={t('Sidebar.runningWorkflowsPanel.details.runId')}
            value={workflowSummary.workflow.run_id || fallbackValue}
          />
          <WorkflowDetailRow
            label={t('Sidebar.runningWorkflowsPanel.details.workflowType')}
            value={workflowSummary.workflow.workflow_type || fallbackValue}
          />
          <WorkflowDetailRow
            label={t('Sidebar.runningWorkflowsPanel.details.startedAt')}
            value={formatWorkflowTimestamp(
              workflowSummary.workflow.workflow_start_time,
              dateLocale,
              fallbackValue,
            )}
          />
          <WorkflowDetailRow
            label={t('Sidebar.runningWorkflowsPanel.details.finishedAt')}
            value={formatWorkflowTimestamp(
              workflowSummary.workflow.workflow_close_time,
              dateLocale,
              fallbackValue,
            )}
          />
          <WorkflowDetailRow label={durationLabel} value={workflowDuration} />
          <WorkflowDetailRow
            label={t(
              'Sidebar.runningWorkflowsPanel.details.childWorkflowCount',
            )}
            value={String(workflowSummary.workflow.children?.length ?? 0)}
          />
        </dl>
        <div className="mt-4 border-t border-border-primary pt-3">
          <p className="mb-2 text-xs font-medium text-text-secondary">
            {t('Sidebar.runningWorkflowsPanel.details.workflowRuns', {
              count: workflowSummary.workflows.length,
            })}
          </p>
          <div className="flex flex-col gap-2">
            {workflowSummary.workflows.map((workflow) => (
              <RunningWorkflowRunRow
                key={`${workflow.workflow_id}:${workflow.run_id}`}
                workflow={workflow}
                dateLocale={dateLocale}
                fallbackValue={fallbackValue}
                now={now}
              />
            ))}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
