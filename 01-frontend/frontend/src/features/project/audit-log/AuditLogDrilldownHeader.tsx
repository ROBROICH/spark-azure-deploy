import type { HistoryItem } from '@/api-clients/protocol-module';
import { Badge } from '@/features/ui/badge/Badge';
import { Button } from '@/features/ui/button/Button';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatSource, formatTimestamp } from './AuditLogFormatters';
import { AuditLogMetadataItem } from './AuditLogMetadataItem';

export function AuditLogDrilldownHeader(props: {
  group: {
    id: string;
    type: 'workflow' | 'request';
  };
  item: HistoryItem | undefined;
  total: number;
  onBack: () => void;
}) {
  const { group, item, total, onBack } = props;
  const { t } = useTranslation('AuditLog');
  const title = getDrilldownTitle(group, item);
  const groupLabel =
    group.type === 'workflow'
      ? t('drilldown.workflow')
      : t('drilldown.request');

  return (
    <div className="mt-1 mb-6 rounded-md border border-ki-200 bg-ki-50 shadow-sm">
      <div className="flex gap-4 p-4">
        <div className="w-1 rounded-full bg-ki-600" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="ai" size="small">
                  {groupLabel}
                </Badge>
                <Badge variant="secondary" size="small">
                  {t('drilldown.changeCount', { count: total })}
                </Badge>
              </div>
              <h3 className="text-base font-semibold text-neutral-950">
                {title}
              </h3>
              <p className="mt-1 text-sm break-all text-neutral-600">
                {group.id}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              withIcon
              onClick={onBack}
              className="shrink-0"
              autoFocus
            >
              <ArrowLeft className="size-4" />
              {t('drilldown.back')}
            </Button>
          </div>
          {item ? (
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <AuditLogMetadataItem
                label={t('fields.service')}
                value={item.service_label}
              />
              <AuditLogMetadataItem
                label={t('fields.source')}
                value={formatSource(item.source, t)}
              />
              <AuditLogMetadataItem
                label={t('fields.timestamp')}
                value={formatTimestamp(item.timestamp)}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function getDrilldownTitle(
  group: {
    id: string;
    type: 'workflow' | 'request';
  },
  item: HistoryItem | undefined,
) {
  if (group.type === 'workflow') {
    return item?.workflow_type ?? item?.service_label ?? group.id;
  }

  return item?.service_label ?? group.id;
}
