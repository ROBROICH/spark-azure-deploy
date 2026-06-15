import { useLiveQuery } from '@tanstack/react-db';
import {
  getAuditLogHistoryCollection,
  getAuditLogHistoryMetadata,
  type AuditLogHistoryQuery,
} from './auditLogHistory.collection';

export const AUDIT_LOG_PAGE_SIZE = 50;

export const useAuditLogHistory = (
  projectId: string,
  query: AuditLogHistoryQuery,
) => {
  const collection = getAuditLogHistoryCollection(projectId, query);
  const { data = [], isLoading, isError } = useLiveQuery(collection);
  const metadata = getAuditLogHistoryMetadata(projectId, query);

  return {
    items: data,
    isLoading,
    isError,
    metadata,
  };
};
