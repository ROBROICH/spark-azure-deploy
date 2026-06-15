import {
  exportProjectHistoryProjectsProjectIdHistoryExportGet,
  type SourceFilter,
} from '@/api-clients/protocol-module';
import type { AuditLogHistoryQuery } from './data/auditLogHistory.collection';

type AuditLogExportQuery = {
  from?: string | null;
  request_id?: string | null;
  to?: string | null;
  source?: SourceFilter | null;
  service?: string | null;
};

export const createAuditLogExportQuery = (
  query: AuditLogHistoryQuery,
): AuditLogExportQuery => ({
  from: query.from,
  request_id: query.request_id,
  to: query.to,
  source: query.source,
  service: query.service,
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
  const { data } = await exportProjectHistoryProjectsProjectIdHistoryExportGet({
    path: { project_id: projectId },
    query: createAuditLogExportQuery(query),
    throwOnError: true,
  });

  downloadJson(data, createExportFilename(projectId));
};
