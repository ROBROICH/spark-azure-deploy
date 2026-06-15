import type { HistoryItem } from '@/api-clients/protocol-module';

export type AuditLogTimeSection = {
  key: string;
  label: string;
};

export type AuditLogEventGroup = {
  section: AuditLogTimeSection;
  items: HistoryItem[];
};
