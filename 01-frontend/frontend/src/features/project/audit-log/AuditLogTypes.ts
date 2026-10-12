import type { HistoryItem } from '@/api-clients/backend';

export type AuditLogTimeSection = {
  key: string;
  label: string;
};

export type AuditLogEventGroup = {
  section: AuditLogTimeSection;
  items: HistoryItem[];
};
