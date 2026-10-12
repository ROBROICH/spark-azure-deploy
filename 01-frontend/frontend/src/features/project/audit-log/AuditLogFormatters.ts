import type { HistoryItem } from '@/api-clients/backend';
import { format, isValid } from 'date-fns';

export function formatTimestamp(value: string) {
  const date = new Date(value);

  if (!isValid(date)) {
    return value;
  }

  return format(date, 'dd.MM.yyyy HH:mm');
}

export function formatSource(source: string, t: (key: string) => string) {
  if (source === 'agent') {
    return t('source.agent');
  }
  if (source === 'user') {
    return t('source.user');
  }

  return source;
}

export function formatChangeType(
  changeType: HistoryItem['changeType'],
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return t(`changeType.${changeType}`);
}
