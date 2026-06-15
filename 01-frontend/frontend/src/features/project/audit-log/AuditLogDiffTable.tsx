import { Button } from '@/features/ui/button/Button';
import type { HistoryItem } from '@/api-clients/protocol-module';
import { Database } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PositionalDiff } from './PositionalDiff';
import { getAuditLogDiffRows } from './auditLogDisplay.logic';

const DIFF_ROW_BATCH_SIZE = 50;

type AuditLogDiffTableProps = {
  item: HistoryItem;
};

export function AuditLogDiffTable(props: AuditLogDiffTableProps) {
  const { item } = props;
  const { t } = useTranslation('AuditLog');
  const tableId = useId();
  // eslint-disable-next-line no-restricted-syntax -- Diff row disclosure is ephemeral UI state, not URL state.
  const [visibleRowCount, setVisibleRowCount] = useState(DIFF_ROW_BATCH_SIZE);
  const rows = getAuditLogDiffRows({
    oldRow: item.old_row,
    newRow: item.new_row,
  });
  const visibleRows = rows.slice(0, visibleRowCount);
  const remainingRowCount = rows.length - visibleRows.length;

  const handleShowMoreRows = () => {
    setVisibleRowCount((currentCount) => currentCount + DIFF_ROW_BATCH_SIZE);
  };

  if (rows.length === 0) {
    return (
      <div className="mt-4 flex items-start gap-2 rounded-md bg-neutral-50 p-3 text-sm text-neutral-600">
        <Database className="mt-0.5 size-4 shrink-0" />
        <span>{t('event.noRowDiff')}</span>
      </div>
    );
  }

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-neutral-200">
      <div className="overflow-x-auto">
        <table id={tableId} className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[28%]" />
            <col className="w-[36%]" />
            <col className="w-[36%]" />
          </colgroup>
          <thead className="bg-neutral-50 text-xs font-semibold tracking-wide text-neutral-600 uppercase">
            <tr>
              <th
                scope="col"
                className="border-r border-neutral-200 px-3 py-2 text-left"
              >
                {t('diff.field')}
              </th>
              <th
                scope="col"
                className="border-r border-neutral-200 px-3 py-2 text-left"
              >
                {t('diff.before')}
              </th>
              <th scope="col" className="px-3 py-2 text-left">
                {t('diff.after')}
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr
                key={row.path}
                className="border-t border-neutral-200 text-sm"
              >
                <th
                  scope="row"
                  className="border-r border-neutral-200 px-3 py-2 text-left align-top font-medium break-all text-neutral-700"
                >
                  {row.path}
                </th>
                <td className="min-w-0 border-r border-neutral-200 px-3 py-2 align-top text-neutral-700">
                  <PositionalDiff
                    oldVal={row.oldValue}
                    newVal={row.newValue}
                    mode="old"
                  />
                </td>
                <td className="min-w-0 px-3 py-2 align-top text-neutral-700">
                  <PositionalDiff
                    oldVal={row.oldValue}
                    newVal={row.newValue}
                    mode="new"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {remainingRowCount > 0 ? (
        <div className="border-t border-neutral-200 bg-neutral-50 px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-controls={tableId}
            onClick={handleShowMoreRows}
          >
            {t('document.showMore', {
              0: Math.min(remainingRowCount, DIFF_ROW_BATCH_SIZE),
              count: Math.min(remainingRowCount, DIFF_ROW_BATCH_SIZE),
            })}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
