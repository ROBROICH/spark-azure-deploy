import type { HistoryItem } from '@/api-clients/protocol-module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildAuditLogHistoryQuery,
  sortHistoryItemsNewestFirst,
} from './AuditLogHelpers';
import { AUDIT_LOG_PAGE_SIZE } from './data/useAuditLogHistory';
import { getAuditLogHistoryItemKey } from './data/auditLogHistory.collection';

const makeHistoryItem = (timestamp: string, entityId: string): HistoryItem => ({
  timestamp,
  entity_type: 'project',
  entity_id: entityId,
  service: 'project_logic',
  service_label: 'Verfahrensdaten',
  change_type: 'update',
  source: 'user',
});

afterEach(() => {
  vi.useRealTimers();
});

describe('sortHistoryItemsNewestFirst', () => {
  it('orders audit events by descending timestamp', () => {
    const oldest = makeHistoryItem('2025-03-01T08:00:00.000Z', 'oldest');
    const newest = makeHistoryItem('2025-03-03T08:00:00.000Z', 'newest');
    const middle = makeHistoryItem('2025-03-02T08:00:00.000Z', 'middle');

    expect(
      sortHistoryItemsNewestFirst([oldest, newest, middle]).map(
        (item) => item.entity_id,
      ),
    ).toEqual(['newest', 'middle', 'oldest']);
  });

  it('does not mutate the source event page', () => {
    const oldest = makeHistoryItem('2025-03-01T08:00:00.000Z', 'oldest');
    const newest = makeHistoryItem('2025-03-03T08:00:00.000Z', 'newest');
    const items = [oldest, newest];

    sortHistoryItemsNewestFirst(items);

    expect(items).toEqual([oldest, newest]);
  });
});

describe('buildAuditLogHistoryQuery', () => {
  const buildQuery = (protocolTimePeriods: string | undefined) =>
    buildAuditLogHistoryQuery({
      protocolOffset: undefined,
      protocolRequestId: undefined,
      protocolService: undefined,
      protocolSource: undefined,
      protocolTimePeriods,
      protocolWorkflowRunId: undefined,
    });

  it('builds an ungrouped workflow drilldown query', () => {
    expect(
      buildAuditLogHistoryQuery({
        protocolOffset: undefined,
        protocolRequestId: undefined,
        protocolService: undefined,
        protocolSource: undefined,
        protocolTimePeriods: undefined,
        protocolWorkflowRunId: 'workflow-run-1',
      }),
    ).toEqual({
      limit: AUDIT_LOG_PAGE_SIZE,
      offset: 0,
      ungrouped: true,
      workflow_run_id: 'workflow-run-1',
    });
  });

  it('builds an ungrouped request drilldown query', () => {
    expect(
      buildAuditLogHistoryQuery({
        protocolOffset: 10,
        protocolRequestId: 'request-1',
        protocolService: undefined,
        protocolSource: undefined,
        protocolTimePeriods: undefined,
        protocolWorkflowRunId: undefined,
      }),
    ).toEqual({
      limit: AUDIT_LOG_PAGE_SIZE,
      offset: 10,
      request_id: 'request-1',
      ungrouped: true,
    });
  });

  it('prefers workflow drilldown when both group identifiers are present', () => {
    expect(
      buildAuditLogHistoryQuery({
        protocolOffset: undefined,
        protocolRequestId: 'request-1',
        protocolService: undefined,
        protocolSource: undefined,
        protocolTimePeriods: undefined,
        protocolWorkflowRunId: 'workflow-run-1',
      }),
    ).toEqual({
      limit: AUDIT_LOG_PAGE_SIZE,
      offset: 0,
      ungrouped: true,
      workflow_run_id: 'workflow-run-1',
    });
  });

  it('keeps the older-than-365 range before the last-365-days range', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 2, 12));

    const last365DaysQuery = buildQuery('365');
    const olderThan365DaysQuery = buildQuery('over-365');

    expect(olderThan365DaysQuery.to).toBe(
      new Date(Date.parse(last365DaysQuery.from ?? '') - 1).toISOString(),
    );
  });

  it('builds mutually exclusive 365-day query boundaries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 2, 12, 13, 14, 15));

    const last365DaysQuery = buildQuery('365');
    const olderThan365DaysQuery = buildQuery('over-365');
    const cutoffStart = new Date(2025, 5, 2, 0, 0, 0, 0);

    expect(last365DaysQuery).toMatchObject({
      from: cutoffStart.toISOString(),
      to: new Date(2026, 5, 2, 23, 59, 59, 999).toISOString(),
    });
    expect(olderThan365DaysQuery).toMatchObject({
      to: new Date(cutoffStart.getTime() - 1).toISOString(),
    });
  });

  it('keeps the boundary day in the last-365-days query only', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 2, 12));

    const last365DaysQuery = buildQuery('365');
    const olderThan365DaysQuery = buildQuery('over-365');
    const boundaryDayStart = new Date(2025, 5, 2, 0, 0, 0, 0).toISOString();
    const boundaryDayEnd = new Date(2025, 5, 2, 23, 59, 59, 999).toISOString();

    expect(last365DaysQuery.from).toBe(boundaryDayStart);
    expect(Date.parse(olderThan365DaysQuery.to ?? '')).toBeLessThan(
      Date.parse(boundaryDayStart),
    );
    expect(Date.parse(olderThan365DaysQuery.to ?? '')).toBeLessThan(
      Date.parse(boundaryDayEnd),
    );
  });
});

describe('getAuditLogHistoryItemKey', () => {
  it('differs when otherwise identical audit events have different request ids', () => {
    const first = {
      ...makeHistoryItem('2025-03-01T08:00:00.000Z', 'entity'),
      request_id: 'request-1',
    };
    const second = {
      ...makeHistoryItem('2025-03-01T08:00:00.000Z', 'entity'),
      request_id: 'request-2',
    };

    expect(getAuditLogHistoryItemKey(first)).not.toEqual(
      getAuditLogHistoryItemKey(second),
    );
  });
});
