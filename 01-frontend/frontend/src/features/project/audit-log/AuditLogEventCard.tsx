import type { HistoryItem } from '@/api-clients/protocol-module';
import { Badge } from '@/features/ui/badge/Badge';
import { Button } from '@/features/ui/button/Button';
import { cn } from '@/features/ui/style/cn';
import { ChevronRight, GitBranch, ListTree } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { AuditLogDiffTable } from './AuditLogDiffTable';
import {
  formatChangeType,
  formatSource,
  formatTimestamp,
} from './AuditLogFormatters';
import { AuditLogMetadataItem } from './AuditLogMetadataItem';

type AuditLogDrilldownGroup = {
  id: string;
  key: string;
  type: 'workflow' | 'request';
};

/**
 * Renders one audit event while keeping drilldown link construction inside the
 * event owner that knows which grouping identifier is valid.
 *
 * @param props Event payload and drilldown availability for this stream state.
 * @returns A card for one protocol history entry.
 */
export function AuditLogEventCard(props: {
  item: HistoryItem;
  allowDrilldown: boolean;
  onOpenGroupLinkClick: (groupKey: string) => void;
}) {
  const { item, allowDrilldown, onOpenGroupLinkClick } = props;
  const { t } = useTranslation('AuditLog');
  const isAgent = item.source === 'agent';
  const drilldownGroup = getDrilldownGroup(item);
  const workflowDrilldownId =
    drilldownGroup?.type === 'workflow' ? drilldownGroup.id : undefined;
  const requestDrilldownId =
    drilldownGroup?.type === 'request' ? drilldownGroup.id : undefined;
  const aggregatedHint = drilldownGroup
    ? getAggregatedHint(drilldownGroup, t)
    : undefined;
  const title = drilldownGroup
    ? getAggregatedTitle(item, drilldownGroup, t)
    : getEventTitle(item, t);

  return (
    <article className="rounded-md border border-neutral-200 bg-white shadow-sm">
      <div className="flex gap-4 p-4">
        <div
          className={cn(
            'mt-1 h-3 w-3 shrink-0 rounded-full',
            isAgent ? 'bg-ki-600' : 'bg-neutral-400',
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" size="small">
              {formatTimestamp(item.timestamp)}
            </Badge>
            {isAgent ? (
              <Badge type="ai" size="small">
                {formatSource(item.source, t)}
              </Badge>
            ) : (
              <Badge variant="secondary" size="small">
                {formatSource(item.source, t)}
              </Badge>
            )}
            <Badge
              variant={getChangeBadgeVariant(item.change_type)}
              size="small"
            >
              {formatChangeType(item.change_type, t)}
            </Badge>
            {drilldownGroup ? (
              <Badge variant="primary" size="small">
                {t('event.groupCount', { count: item.group_count })}
              </Badge>
            ) : null}
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-neutral-950">
                {title}
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                {item.service_label}
                {item.service ? ` (${item.service})` : ''}
              </p>
            </div>
            {drilldownGroup && allowDrilldown ? (
              <Button
                asChild
                variant="secondary"
                size="sm"
                withIcon
                className="shrink-0"
              >
                <Link
                  to="."
                  search={(prev) => ({
                    ...prev,
                    protocolWorkflowRunId: workflowDrilldownId,
                    protocolRequestId: requestDrilldownId,
                    protocolDrilldownOffset: undefined,
                  })}
                  resetScroll={false}
                  data-audit-log-group-link={drilldownGroup.key}
                  onClick={() => onOpenGroupLinkClick(drilldownGroup.key)}
                >
                  <ListTree className="size-4" />
                  {t('event.showGroup')}
                  <ChevronRight className="size-4" />
                </Link>
              </Button>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm xl:grid-cols-3">
            <AuditLogMetadataItem
              label={t('fields.entityType')}
              value={item.entity_type}
            />
            <AuditLogMetadataItem
              label={t('fields.entityId')}
              value={item.entity_id}
            />
            <AuditLogMetadataItem
              label={t('fields.actionType')}
              value={item.action_type}
            />
            <AuditLogMetadataItem
              label={t('fields.workflowType')}
              value={item.workflow_type}
            />
            <AuditLogMetadataItem
              label={t('fields.workflowRunId')}
              value={item.workflow_run_id}
            />
            <AuditLogMetadataItem
              label={t('fields.requestId')}
              value={item.request_id}
            />
            <AuditLogMetadataItem
              label={t('fields.actorUserId')}
              value={item.actor_user_id}
            />
            <AuditLogMetadataItem
              label={t('fields.triggeredByUserId')}
              value={item.triggered_by_user_id}
            />
          </div>

          {drilldownGroup ? (
            <div className="mt-4 flex items-start gap-2 rounded-md bg-neutral-50 p-3 text-sm text-neutral-700">
              <GitBranch className="mt-0.5 size-4 shrink-0" />
              <span>{aggregatedHint}</span>
            </div>
          ) : (
            <AuditLogDiffTable item={item} />
          )}
        </div>
      </div>
    </article>
  );
}

function getAggregatedHint(
  group: AuditLogDrilldownGroup,
  t: (key: string) => string,
) {
  if (group.type === 'workflow') {
    return t('event.aggregatedHint');
  }

  return t('event.requestAggregatedHint');
}

function getDrilldownGroup(item: HistoryItem): AuditLogDrilldownGroup | null {
  if ((item.group_count ?? 1) <= 1) {
    return null;
  }

  if (item.workflow_run_id) {
    return {
      id: item.workflow_run_id,
      key: `workflow:${item.workflow_run_id}`,
      type: 'workflow',
    };
  }

  if (item.request_id) {
    return {
      id: item.request_id,
      key: `request:${item.request_id}`,
      type: 'request',
    };
  }

  return null;
}

function getAggregatedTitle(
  item: HistoryItem,
  group: AuditLogDrilldownGroup,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (group.type === 'workflow') {
    return t('event.aggregatedTitle', {
      count: item.group_count,
      workflow: item.workflow_type ?? item.service_label,
    });
  }

  return t('event.requestAggregatedTitle', {
    count: item.group_count,
  });
}

function getChangeBadgeVariant(changeType: HistoryItem['change_type']) {
  if (changeType === 'create') {
    return 'success';
  }
  if (changeType === 'delete') {
    return 'error';
  }
  if (changeType === 'action') {
    return 'primary';
  }

  return 'secondary';
}

function getEventTitle(
  item: HistoryItem,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (item.change_type === 'action') {
    return item.action_type ?? t('event.actionTitle');
  }

  return t('event.changeTitle', {
    changeType: formatChangeType(item.change_type, t),
    entityType: item.entity_type,
  });
}
