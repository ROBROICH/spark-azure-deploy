import {
  renderIndentGuides,
  type RowNode,
} from '@/features/project/data/document-tree/documentTreeTable';
import { OverflowTooltip } from '@/features/ui/tooltip/Tooltip';
import { cn } from '@/features/ui/style/cn';
import { formatDateTime } from '@/i18n/formatDate';
import type { ColumnDef } from '@tanstack/react-table';
import { createColumnHelper } from '@tanstack/react-table';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
} from 'lucide-react';

const columnHelper = createColumnHelper<RowNode>();

type ReadOnlyColumnCallbacks = {
  activeDocumentId?: string;
  onFileClick: (documentId: string) => void;
};

type FolderTranslations = {
  expandFolder: (folderName: string) => string;
  collapseFolder: (folderName: string) => string;
};

type ContentsCellProps = {
  row: {
    depth: number;
    original: RowNode;
    getIsExpanded: () => boolean;
    getToggleExpandedHandler: () => () => void;
  };
  callbacks: ReadOnlyColumnCallbacks;
  folderTranslations: FolderTranslations;
};

function renderReadOnlyFolderCell(props: ContentsCellProps) {
  const { row, folderTranslations } = props;
  const node = row.original;

  if (node.kind !== 'folder') {
    return null;
  }

  const isExpanded = row.getIsExpanded();
  const toggle = row.getToggleExpandedHandler();

  return (
    <div className="flex w-full items-center">
      {renderIndentGuides(row.depth)}
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isExpanded}
        aria-label={
          isExpanded
            ? folderTranslations.collapseFolder(node.title)
            : folderTranslations.expandFolder(node.title)
        }
        className="focus-ring flex w-full items-center gap-1.5 rounded py-3 text-left"
      >
        <span className="shrink-0 text-text-secondary" aria-hidden>
          {isExpanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </span>
        <span className="shrink-0 text-text-secondary" aria-hidden>
          {isExpanded ? (
            <FolderOpen className="size-5" />
          ) : (
            <Folder className="size-4" />
          )}
        </span>
        <span className="text-sm tracking-tight text-text-secondary">
          {node.title}
        </span>
      </button>
    </div>
  );
}

function renderReadOnlyDeletedDocumentCell(props: ContentsCellProps) {
  const { row } = props;
  const node = row.original;

  if (node.kind !== 'document' || !node.isDeleted) {
    return null;
  }

  return (
    <div className="flex items-center">
      {renderIndentGuides(row.depth)}
      <div className="flex min-w-0 items-center gap-1 py-2">
        <span className="shrink-0 rounded p-1">
          <FileText className="text-text-disabled size-4" />
        </span>
        <OverflowTooltip content={node.filename} side="top">
          <span
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- tooltip trigger anchor inside TooltipTrigger asChild; tabIndex makes truncated text keyboard-accessible
            tabIndex={0}
            className="focus-ring text-text-disabled block truncate rounded text-sm tracking-tight line-through"
          >
            {node.filename}
          </span>
        </OverflowTooltip>
      </div>
    </div>
  );
}

function renderReadOnlyActiveDocumentCell(props: ContentsCellProps) {
  const { row, callbacks } = props;
  const node = row.original;
  const isActiveDocument = callbacks.activeDocumentId === node.id;

  if (node.kind !== 'document' || node.isDeleted) {
    return null;
  }

  return (
    <div className="flex items-center">
      {renderIndentGuides(row.depth)}
      <div
        className={cn(
          'my-1 flex min-w-0 items-center gap-1 rounded-md py-1.5 pr-2 pl-1 transition-all',
          isActiveDocument && 'selected-ring-inset bg-neutral-white',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'h-6 w-1.5 shrink-0 rounded-full bg-transparent transition-colors',
            isActiveDocument && 'bg-info-600',
          )}
        />
        <span className="shrink-0 rounded p-1">
          <FileText className="size-4 text-text-secondary" />
        </span>
        <OverflowTooltip content={node.filename} side="top">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              callbacks.onFileClick(node.id);
            }}
            className={cn(
              'focus-ring block min-w-0 truncate rounded text-left text-[13px] font-medium text-text-primary underline underline-offset-2',
              isActiveDocument && 'no-underline',
            )}
          >
            {node.filename}
          </button>
        </OverflowTooltip>
      </div>
    </div>
  );
}

function renderContentsCell(props: ContentsCellProps) {
  const node = props.row.original;

  if (node.kind === 'folder') {
    return renderReadOnlyFolderCell(props);
  }

  if (node.isDeleted) {
    return renderReadOnlyDeletedDocumentCell(props);
  }

  return renderReadOnlyActiveDocumentCell(props);
}

type VersioningCellProps = {
  row: { original: RowNode };
  language: string;
};

function renderVersioningCell(props: VersioningCellProps) {
  const node = props.row.original;

  if (node.kind === 'folder') {
    return null;
  }

  return node.createdAt ? (
    <span className="text-sm tracking-tight text-text-secondary">
      {formatDateTime(node.createdAt, props.language)}
    </span>
  ) : null;
}

type ReadOnlyColumnLabels = {
  contentsHeader: string;
  versionHeader: string;
  language: string;
  folderTranslations: FolderTranslations;
};

export const createReadOnlyColumns = (
  callbacks: ReadOnlyColumnCallbacks,
  labels: ReadOnlyColumnLabels,
): ColumnDef<RowNode, unknown>[] => [
  columnHelper.display({
    id: 'contents',
    header: labels.contentsHeader,
    size: 600,
    cell: (cellProps) =>
      renderContentsCell({
        row: cellProps.row,
        callbacks,
        folderTranslations: labels.folderTranslations,
      }),
  }),
  columnHelper.display({
    id: 'versioning',
    header: labels.versionHeader,
    size: 180,
    cell: (cellProps) =>
      renderVersioningCell({
        row: cellProps.row,
        language: labels.language,
      }),
  }),
];
