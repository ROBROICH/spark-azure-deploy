import {
  v1ProtocolExportProjectHistory as exportProjectHistory,
  type SourceFilter,
} from '@/api-clients/backend';
import type { AuditLogHistoryQuery } from './data/auditLogHistory.collection';

type AuditLogExportQuery = {
  from?: string;
  requestId?: string;
  to?: string;
  source?: SourceFilter;
  service?: string;
};

/**
 * Copies only the exportable audit-log query fields into the download payload.
 */
export const createAuditLogExportQuery = (
  query: AuditLogHistoryQuery,
): AuditLogExportQuery => ({
  ...(query.from ? { from: query.from } : {}),
  ...(query.requestId ? { requestId: query.requestId } : {}),
  ...(query.to ? { to: query.to } : {}),
  ...(query.source ? { source: query.source } : {}),
  ...(query.service ? { service: query.service } : {}),
});

const createExportFilename = (projectId: string) => {
  const date = new Date().toISOString().slice(0, 10);
  return `audit-log-${projectId}-${date}.json`;
};

const downloadJson = (data: unknown, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
};

export const exportAuditLogHistory = async (
  projectId: string,
  query: AuditLogHistoryQuery,
) => {
  const { data } = await exportProjectHistory({
    path: { projectId: projectId },
    query: createAuditLogExportQuery(query),
    throwOnError: true,
  });

  downloadJson(data, createExportFilename(projectId));
};
