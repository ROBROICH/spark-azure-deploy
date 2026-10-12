import type {
  ColumnCallbacks,
  RowNode,
} from '@/features/project/fvp/main-screen/documents-card/documents-table/columns.shared';
import { DOCUMENT_STATUS } from '@/features/project/data/document-tree/documentTree.types';
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Button } from '@/features/ui/button/Button';
import {
  type CellContext,
  type ColumnDef,
  createColumnHelper,
} from '@tanstack/react-table';
import { FileInput, MessageSquare, MoreVertical } from 'lucide-react';
import {
  DocumentTypeBadgeSelect,
  type DocumentTypeStatus,
} from './DocumentTypeBadgeSelect';
import { TopicBadgeSelect } from './TopicBadgeSelect';

const columnHelper = createColumnHelper<RowNode>();

/**
 * Missing/requested types are handled elsewhere; deleted assignments remain read-only.
 * @param callbacks - Authorized assignment actions and the complete type catalog.
 * @param context - Current document row from the table.
 * @returns The applicable assignment control, retained deleted label, or no cell.
 */
function renderDocumentTypeCell(
  callbacks: ColumnCallbacks,
  context: CellContext<RowNode, unknown>,
) {
  const node = context.row.original;
  if (node.kind === 'folder') {
    return null;
  }

  if (
    node.status === DOCUMENT_STATUS.missingType ||
    node.status === DOCUMENT_STATUS.onRequestList
  ) {
    return null;
  }

  if (node.isDeleted && node.linkedDocumentType) {
    return (
      <span className="text-text-disabled text-[13px] leading-[18px] tracking-[-0.01em] line-through">
        {node.linkedDocumentType.name}
      </span>
    );
  }

  if (node.isDeleted) {
    return null;
  }

  const linked = node.linkedDocumentType;
  const status: DocumentTypeStatus = !linked
    ? { kind: 'unlinked' }
    : linked.humanApproved
      ? {
          kind: 'linked',
          label: linked.name,
          selectedTypeId: linked.id,
        }
      : {
          kind: 'ai_suggestion',
          label: linked.name,
          selectedTypeId: linked.id,
          confidence: node.confidence ?? null,
        };

  return (
    <DocumentTypeBadgeSelect
      disabled={!callbacks.canMutateProject}
      status={status}
      availableTypes={callbacks.availableDocumentTypesStructured}
      onConfirm={() => {
        if (node.linkedDocumentType) {
          callbacks.onSelectDocumentType(node.id, node.linkedDocumentType.id);
        }
      }}
      onSelect={(typeId) => callbacks.onSelectDocumentType(node.id, typeId)}
      onManageCustomDocumentTypes={callbacks.onManageCustomDocumentTypes}
    />
  );
}

export function createDocumentTypeColumn(
  callbacks: ColumnCallbacks,
): ColumnDef<RowNode, unknown> {
  return columnHelper.display({
    id: 'documentType',
    header: callbacks.t('redesign.documentsCard.headers.documentType'),
    size: 240,
    cell: (context) => renderDocumentTypeCell(callbacks, context),
  });
}

function renderTopicCell(
  callbacks: ColumnCallbacks,
  context: CellContext<RowNode, unknown>,
) {
  const node = context.row.original;
  if (node.kind === 'folder') {
    return null;
  }

  const isReadOnly =
    node.status === DOCUMENT_STATUS.missingType ||
    node.status === DOCUMENT_STATUS.onRequestList ||
    Boolean(node.isDeleted);

  if (isReadOnly) {
    return null;
  }

  return (
    <TopicBadgeSelect
      dmsFileId={node.id}
      disabled={!callbacks.canMutateProject}
    />
  );
}

export function createTopicColumn(
  callbacks: ColumnCallbacks,
): ColumnDef<RowNode, unknown> {
  return columnHelper.display({
    id: 'topic',
    header: callbacks.t('redesign.documentsCard.headers.topic'),
    size: 240,
    cell: (context) => renderTopicCell(callbacks, context),
  });
}

function renderActionCell(
  callbacks: ColumnCallbacks,
  context: CellContext<RowNode, unknown>,
) {
  const node = context.row.original;
  if (node.kind === 'folder') {
    return null;
  }

  const isOnRequestList = node.status === DOCUMENT_STATUS.onRequestList;
  const isRequestDisabled = !callbacks.canMutateProject || isOnRequestList;
  const isCommentDisabled = !callbacks.canMutateProject;

  return (
    <div className="flex justify-end">
      <ActionMenu>
        <ActionMenuTrigger asChild>
          <Button
            variant="ghost-light"
            iconOnly
            size="xs"
            aria-label={callbacks.t(
              'redesign.documentsCard.actions.ariaLabel',
              {
                name: node.filename,
              },
            )}
            onClick={(event) => {
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
            }}
          >
            <MoreVertical className="size-4" aria-hidden="true" />
          </Button>
        </ActionMenuTrigger>
        <ActionMenuContent
          align="end"
          onClick={(event) => {
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
        >
          <ActionMenuItem
            disabled={isRequestDisabled}
            onClick={() => {
              if (isRequestDisabled) {
                return;
              }

              const source =
                node.missingReason?.kind === 'required_missing'
                  ? 'requiredDocuments'
                  : undefined;
              callbacks.onRequestDocument(node.filename, node.id, source);
            }}
          >
            <FileInput />
            {callbacks.t('common.actions.request')}
          </ActionMenuItem>
          <ActionMenuItem
            disabled={isCommentDisabled}
            onClick={() => {
              if (isCommentDisabled) {
                return;
              }

              callbacks.onAddComment(node.filename);
            }}
          >
            <MessageSquare />
            {callbacks.t('common.actions.addComment')}
          </ActionMenuItem>
        </ActionMenuContent>
      </ActionMenu>
    </div>
  );
}

export function createActionColumn(
  callbacks: ColumnCallbacks,
): ColumnDef<RowNode, unknown> {
  return columnHelper.display({
    id: 'action',
    header: '',
    size: 48,
    cell: (context) => renderActionCell(callbacks, context),
  });
}
