import type { RowNode } from '@/features/project/fvp/main-screen/documents-card/documents-table/columns.shared';
import type { DocumentStatus } from '@/features/project/data/document-tree/documentTree.types';
import { cn } from '@/features/ui/style/cn';
import { type Table, flexRender } from '@tanstack/react-table';
import { useTranslation } from 'react-i18next';

type DocumentsTableViewProps = {
  table: Table<RowNode>;
};

const HEADER_CELL_CLASSES =
  'px-3 py-[11px] text-left align-middle text-[13px] font-medium leading-[18px] tracking-[-0.01em] text-text-primary';

const ROW_BACKGROUND_BY_STATUS = {
  Zugeordnet: 'bg-neutral-white',
  'Unterlagentyp fehlt': 'border-l-4 border-l-error-600 bg-error-50',
  'Nicht zugeordnet': 'bg-warning-100',
  'Auf Nachforderungsliste': 'border-l-4 border-l-error-600 bg-error-50',
  Nachgefordert: 'bg-neutral-white',
  Gelöscht: 'bg-neutral-white',
  Gelöst: 'bg-slate-50',
} satisfies Record<DocumentStatus, string>;

/** Maps a row's kind/status to its background (and missing/request accent). */
const getRowBackgroundClass = (node: RowNode): string =>
  node.kind === 'folder'
    ? 'bg-slate-50'
    : ROW_BACKGROUND_BY_STATUS[node.status];

/**
 * Renders the FVP documents table as a native table. Folder rows are expanded
 * via an explicit toggle button in the contents cell (see columns.display),
 * not whole-row keyboard handling, so the keyboard model matches the semantics.
 *
 * @param props Table view props containing the TanStack table instance.
 * @returns The documents table body and headers.
 */
export const DocumentsTableView = (props: DocumentsTableViewProps) => {
  // eslint-disable-next-line react-compiler/react-compiler -- expanded state and column visibility update during render via search params; opting out matches the legacy and read-only siblings.
  'use no memo';

  const { table } = props;
  const { t } = useTranslation('FormalCompletenessCheck');

  const visibleRows = table.getRowModel().rows;

  return (
    <div
      className="overflow-x-auto overflow-y-hidden rounded-lg border border-slate-200 bg-slate-50"
      role="region"
      aria-label={t('redesign.documentsCard.tableAriaLabel')}
      tabIndex={0}
    >
      <table
        className="w-full min-w-[360px] table-fixed border-collapse"
        aria-label={t('redesign.documentsCard.tableAriaLabel')}
      >
        <thead className="sticky top-0 z-[5] bg-slate-100">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-slate-200">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  scope="col"
                  className={HEADER_CELL_CLASSES}
                  style={{ width: header.getSize() }}
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {visibleRows.map((row) => {
            const node = row.original;
            const isResolved = node.kind === 'document' && node.isResolved;

            return (
              <tr
                key={row.id}
                className={cn(
                  'h-10 scroll-mt-14 border-b border-slate-200 last:border-b-0',
                  getRowBackgroundClass(node),
                  isResolved &&
                    'opacity-50 [&_button]:line-through [&_span]:line-through',
                )}
                data-folder-path={
                  node.kind === 'folder' ? node.path : undefined
                }
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={cn(
                      'px-3 align-middle',
                      cell.column.id === 'contents' ? 'py-0' : 'py-1',
                    )}
                    style={{ width: cell.column.getSize() }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
