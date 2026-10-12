import type { HistoryItem } from '@/api-clients/backend';
import {
  endOfDay,
  isAfter,
  isToday,
  isYesterday,
  startOfDay,
  subDays,
} from 'date-fns';
import type { AuditLogTimeSection } from './AuditLogTypes';
import { AUDIT_LOG_PAGE_SIZE } from './data/useAuditLogHistory';
import type { AuditLogHistoryQuery } from './data/auditLogHistory.collection';

const KNOWN_DAY_PERIODS = new Set(['0', '1', '7', '30', '180', '365']);

/**
 * Converts audit-log route search state into the protocol history query.
 * Workflow drilldowns intentionally win when both group identifiers are present.
 *
 * @param params Audit-log route search values.
 * @returns Protocol history query parameters for the current list or drilldown.
 */
export function buildAuditLogHistoryQuery(params: {
  protocolOffset: number | undefined;
  protocolRequestId: string | undefined;
  protocolService: string | undefined;
  protocolSource: 'user' | 'agent' | 'all' | undefined;
  protocolTimePeriods: string | undefined;
  protocolWorkflowRunId: string | undefined;
}): AuditLogHistoryQuery {
  const {
    protocolOffset,
    protocolRequestId,
    protocolService,
    protocolSource,
    protocolTimePeriods,
    protocolWorkflowRunId,
  } = params;
  const nextQuery: AuditLogHistoryQuery = {
    limit: AUDIT_LOG_PAGE_SIZE,
    offset:
      protocolOffset === undefined
        ? 0
        : Math.max(0, Math.floor(protocolOffset)),
  };
  const dateRange = getDateRange(protocolTimePeriods);

  if (dateRange.from) {
    nextQuery.from = dateRange.from;
  }
  if (dateRange.to) {
    nextQuery.to = dateRange.to;
  }
  if (protocolSource === 'user' || protocolSource === 'agent') {
    nextQuery.source = protocolSource;
  }
  if (protocolService) {
    nextQuery.service = protocolService;
  }
  if (protocolWorkflowRunId) {
    nextQuery.workflowRunId = protocolWorkflowRunId;
    nextQuery.ungrouped = true;
  } else if (protocolRequestId) {
    nextQuery.requestId = protocolRequestId;
    nextQuery.ungrouped = true;
  }

  return nextQuery;
}

export function getTimeSections(
  t: (key: string) => string,
): AuditLogTimeSection[] {
  return [
    { key: 'today', label: t('filterBar.timePeriods.today') },
    { key: 'yesterday', label: t('filterBar.timePeriods.yesterday') },
    { key: 'last7', label: t('filterBar.timePeriods.7-days') },
    { key: 'last30', label: t('filterBar.timePeriods.30-days') },
    { key: 'last180', label: t('filterBar.timePeriods.180-days') },
    { key: 'last365', label: t('filterBar.timePeriods.365-days') },
    { key: 'older', label: t('filterBar.timePeriods.over-365-days') },
  ];
}

export function groupHistoryItems(
  items: HistoryItem[],
  sections: AuditLogTimeSection[],
) {
  const grouped = new Map(
    sections.map((section) => [section.key, [] as HistoryItem[]]),
  );

  items.forEach((item) => {
    grouped.get(getTimeCategory(item.timestamp))?.push(item);
  });

  return sections.map((section) => ({
    section,
    items: grouped.get(section.key) ?? [],
  }));
}

export function sortHistoryItemsNewestFirst(items: HistoryItem[]) {
  return [...items].sort(
    (left, right) =>
      getSortableTimestamp(right.timestamp) -
      getSortableTimestamp(left.timestamp),
  );
}

/**
 * Converts supported period presets into inclusive backend date bounds. The
 * older-than-365 preset ends one millisecond before the last-365-days window.
 *
 * @param period Time-period search value from the audit log route state.
 * @returns Backend date bounds, or an empty object for unsupported/unfiltered values.
 */
function getDateRange(period: string | undefined) {
  const now = new Date();
  const todayEnd = endOfDay(now).toISOString();

  if (period === '0') {
    return {
      from: startOfDay(now).toISOString(),
      to: todayEnd,
    };
  }

  if (period === '1') {
    const yesterday = subDays(now, 1);
    return {
      from: startOfDay(yesterday).toISOString(),
      to: endOfDay(yesterday).toISOString(),
    };
  }

  if (period === 'over-365') {
    const cutoffStart = startOfDay(subDays(now, 365));

    return {
      to: new Date(cutoffStart.getTime() - 1).toISOString(),
    };
  }

  if (period && KNOWN_DAY_PERIODS.has(period)) {
    return {
      from: startOfDay(subDays(now, Number.parseInt(period, 10))).toISOString(),
      to: todayEnd,
    };
  }

  return {};
}

function getTimeCategory(dateString: string) {
  const date = new Date(dateString);
  const now = new Date();

  if (isToday(date)) {
    return 'today';
  }
  if (isYesterday(date)) {
    return 'yesterday';
  }
  if (isAfter(date, subDays(now, 7))) {
    return 'last7';
  }
  if (isAfter(date, subDays(now, 30))) {
    return 'last30';
  }
  if (isAfter(date, subDays(now, 180))) {
    return 'last180';
  }
  if (isAfter(date, subDays(now, 365))) {
    return 'last365';
  }

  return 'older';
}

function getSortableTimestamp(value: string) {
  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}
