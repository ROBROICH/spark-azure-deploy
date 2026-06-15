import {
  documentStatusTranslationKey,
  type ColumnCallbacks,
} from '@/features/project/fvp/main-screen/documents-card/documents-table/columns.shared';
import {
  countDocumentsInFolder,
  renderIndentGuides,
  type RowNode,
} from '@/features/project/data/document-tree/documentTreeTable';
import {
  DOCUMENT_STATUS,
  type DocumentStatus,
} from '@/features/project/data/document-tree/documentTree.types';
import {
  StatusBadge,
  type StatusBadgeVariant,
} from '@/features/ui/status-badge/StatusBadge';
import { OverflowTooltip } from '@/features/ui/tooltip/Tooltip';
import { cn } from '@/features/ui/style/cn';
import {
  type CellContext,
  type ColumnDef,
  createColumnHelper,
} from '@tanstack/react-table';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  HelpCircle,
} from 'lucide-react';

const columnHelper = createColumnHelper<RowNode>();

const STATUS_VARIANT = {
  Zugeordnet: 'success',
  'Unterlagentyp fehlt': 'error',
  'Nicht zugeordnet': 'warning',
  'Auf Nachforderungsliste': 'warning',
  Nachgefordert: 'warning',
  Gelöscht: 'default',
  Gelöst: 'default',
} satisfies Record<DocumentStatus, StatusBadgeVariant>;

const statusBadgeVariant = (status: DocumentStatus): StatusBadgeVariant =>
  STATUS_VARIANT[status];

/**
 * Renders the tree column cell for folders and documents, including indentation,
 * preview activation, and status badges for document rows.
 *
 * @param callbacks Column callbacks used for preview selection and active state.
 * @param cell TanStack cell context for the current row.
 * @returns The rendered contents cell.
 */
function renderContentsCell(
  callbacks: ColumnCallbacks,
  cell: CellContext<RowNode, unknown>,
) {
  const { row } = cell;
  const node = row.original;
  const isActiveDocument =
    node.kind === 'document' && callbacks.activeDocumentId === node.id;

  if (node.kind === 'folder') {
    return (
      <div className="flex items-center">
        {renderIndentGuides(row.depth)}
        <button
          type="button"
          aria-expanded={row.getIsExpanded()}
          onClick={() => row.toggleExpanded()}
          className="focus-ring flex items-center gap-2 rounded py-2 text-left"
        >
          <span className="shrink-0 text-text-secondary" aria-hidden="true">
            {row.getIsExpanded() ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </span>
          <span className="shrink-0 text-text-secondary" aria-hidden="true">
            {row.getIsExpanded() ? (
              <FolderOpen className="size-4" />
            ) : (
              <Folder className="size-4" />
            )}
          </span>
          <span className="text-[13px] leading-[18px] tracking-[-0.01em] text-text-secondary">
            {node.title}
          </span>
        </button>
      </div>
    );
  }

  const isUnassigned = node.status === DOCUMENT_STATUS.unassigned;
  const isMissing = node.status === DOCUMENT_STATUS.missingType;
  const isOnRequestList = node.status === DOCUMENT_STATUS.onRequestList;

  if ((isMissing || isOnRequestList) && node.missingReason) {
    return (
      <div className="flex items-center">
        {renderIndentGuides(row.depth)}
        <div className="flex min-w-0 items-center gap-2 py-2">
          <AlertCircle className="size-4 shrink-0 text-error-600" />
          <span className="text-[13px] leading-[18px] tracking-[-0.01em] text-text-primary">
            {callbacks.t('DocumentsCard.table.missingDocument', {
              documentType: node.missingReason.documentType,
            })}
          </span>
        </div>
      </div>
    );
  }

  const Icon = isUnassigned ? HelpCircle : FileText;

  if (node.isDeleted) {
    return (
      <div className="flex items-center">
        {renderIndentGuides(row.depth)}
        <div className="flex min-w-0 items-center gap-2 py-2">
          <Icon className="text-text-disabled size-4 shrink-0" />
          <OverflowTooltip content={node.filename} side="top">
            <span
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- tooltip trigger anchor inside TooltipTrigger asChild; tabIndex makes truncated text keyboard-accessible
              tabIndex={0}
              className="focus-ring text-text-disabled block truncate rounded text-[13px] leading-[18px] tracking-[-0.01em] line-through"
            >
              {node.filename}
            </span>
          </OverflowTooltip>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center">
      {renderIndentGuides(row.depth)}
      <div
        className={cn(
          'my-1 flex min-w-0 items-center gap-2 rounded-md py-1 pr-2 pl-1.5 transition-all',
          isActiveDocument && 'selected-ring-inset bg-neutral-white',
        )}
      >
        <Icon
          className={cn(
            'size-4 shrink-0',
            isUnassigned ? 'text-warning-600' : 'text-text-secondary',
          )}
        />
        <OverflowTooltip content={node.filename} side="top">
          <button
            type="button"
            aria-current={isActiveDocument ? 'true' : undefined}
            className={cn(
              'focus-ring min-w-0 cursor-pointer truncate rounded-[2px] border-0 bg-transparent p-0 text-left text-[13px] leading-[18px] font-medium tracking-[-0.01em] text-text-primary',
            )}
            onClick={(event) => {
              event.stopPropagation();
              callbacks.onFileClick(node.id);
            }}
          >
            {node.filename}
          </button>
        </OverflowTooltip>
      </div>
    </div>
  );
}

export function createContentsColumn(
  callbacks: ColumnCallbacks,
): ColumnDef<RowNode, unknown> {
  return columnHelper.display({
    id: 'contents',
    header: callbacks.t('redesign.documentsCard.headers.tableOfContents'),
    size: 360,
    cell: (context) => renderContentsCell(callbacks, context),
  });
}

function renderStatusCell(
  callbacks: ColumnCallbacks,
  context: CellContext<RowNode, unknown>,
) {
  const node = context.row.original;

  if (node.kind === 'folder') {
    const { total, available } = countDocumentsInFolder(node);
    if (total === 0) {
      return null;
    }

    return (
      <span className="text-[13px] leading-[18px] tracking-[-0.01em] text-text-secondary">
        {callbacks.t('DocumentsCard.table.folderStatus', {
          available,
          total,
        })}
      </span>
    );
  }

  return (
    <StatusBadge variant={statusBadgeVariant(node.status)}>
      {callbacks.t(documentStatusTranslationKey[node.status])}
    </StatusBadge>
  );
}

export function createStatusColumn(
  callbacks: ColumnCallbacks,
): ColumnDef<RowNode, unknown> {
  return columnHelper.display({
    id: 'status',
    header: callbacks.t('redesign.documentsCard.headers.status'),
    size: 160,
    cell: (context) => renderStatusCell(callbacks, context),
  });
}
