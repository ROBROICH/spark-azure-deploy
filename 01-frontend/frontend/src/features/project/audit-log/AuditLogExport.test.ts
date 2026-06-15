import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAuditLogExportQuery,
  exportAuditLogHistory,
} from './AuditLogExport';
import type { AuditLogHistoryQuery } from './data/auditLogHistory.collection';

const mocks = vi.hoisted(() => ({
  exportProjectHistory: vi.fn(),
}));

vi.mock('@/api-clients/protocol-module', () => ({
  exportProjectHistoryProjectsProjectIdHistoryExportGet:
    mocks.exportProjectHistory,
}));

const originalCreateObjectUrl = globalThis.URL.createObjectURL;
const originalRevokeObjectUrl = globalThis.URL.revokeObjectURL;

const setupDownloadMocks = () => {
  const click = vi.fn();

  globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:audit-log');
  globalThis.URL.revokeObjectURL = vi.fn();
  vi.spyOn(document, 'createElement').mockReturnValue({
    set href(_value: string) {},
    set download(_value: string) {},
    click,
  } as unknown as HTMLAnchorElement);

  return { click };
};

afterEach(() => {
  vi.restoreAllMocks();
  mocks.exportProjectHistory.mockReset();
  globalThis.URL.createObjectURL = originalCreateObjectUrl;
  globalThis.URL.revokeObjectURL = originalRevokeObjectUrl;
});

describe('createAuditLogExportQuery', () => {
  it('preserves request drilldown and export-supported filters only', () => {
    const query: AuditLogHistoryQuery = {
      from: '2026-01-01T00:00:00.000Z',
      limit: 50,
      offset: 100,
      request_id: 'request-1',
      service: 'formal_completeness',
      source: 'user',
      to: '2026-01-31T23:59:59.999Z',
      ungrouped: true,
      workflow_run_id: 'workflow-run-1',
    };

    expect(createAuditLogExportQuery(query)).toEqual({
      from: '2026-01-01T00:00:00.000Z',
      request_id: 'request-1',
      service: 'formal_completeness',
      source: 'user',
      to: '2026-01-31T23:59:59.999Z',
    });
  });
});

describe('exportAuditLogHistory', () => {
  it('forwards request drilldown scope to the generated export client', async () => {
    const { click } = setupDownloadMocks();
    mocks.exportProjectHistory.mockResolvedValue({
      data: [{ id: 'history-1' }],
    });

    await exportAuditLogHistory('project-1', {
      from: '2026-01-01T00:00:00.000Z',
      limit: 50,
      offset: 0,
      request_id: 'request-1',
      service: 'formal_completeness',
      source: 'agent',
      to: '2026-01-31T23:59:59.999Z',
      ungrouped: true,
    });

    expect(mocks.exportProjectHistory).toHaveBeenCalledWith({
      path: { project_id: 'project-1' },
      query: {
        from: '2026-01-01T00:00:00.000Z',
        request_id: 'request-1',
        service: 'formal_completeness',
        source: 'agent',
        to: '2026-01-31T23:59:59.999Z',
      },
      throwOnError: true,
    });
    expect(click).toHaveBeenCalledOnce();
  });
});
