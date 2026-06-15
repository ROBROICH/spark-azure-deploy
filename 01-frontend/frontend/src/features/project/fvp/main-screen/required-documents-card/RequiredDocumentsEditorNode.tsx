import { Button } from '@/features/ui/button/Button';
import { cn } from '@/features/ui/style/cn';
import { ChevronDown, ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { RequiredDocumentNode } from '../data/schemas/requiredDocument.schema';
import { useRequiredDocumentsEditorContext } from './RequiredDocumentsEditorContext';

type RequiredDocumentsEditorNodeProps = {
  node: RequiredDocumentNode;
  depth?: number;
  parentId?: string;
};

const ROW_CLASS_NAME =
  'flex min-h-8 items-center gap-2 rounded-[8px] border border-border-primary bg-neutral-white px-3 py-2';

/** Renders one editable required-document node and recursively nests its children. */
export const RequiredDocumentsEditorNode = (
  props: RequiredDocumentsEditorNodeProps,
) => {
  const { node, depth = 0, parentId } = props;
  const { t } = useTranslation('FormalCompletenessCheck');
  const {
    customCategoryId,
    expandedNodes,
    editingId,
    editingValue,
    hasDuplicateEditingDocumentTypeError,
    inputRef,
    setEditingValue,
    confirmEdit,
    cancelEdit,
    toggleNode,
    startEditing,
    removeDocument,
  } = useRequiredDocumentsEditorContext();

  const isCategory = node.children !== undefined;
  const hasChildren = node.children && node.children.length > 0;
  const isCustomCategory = node.id === customCategoryId && isCategory;
  const isExpanded = isCustomCategory || expandedNodes.has(node.id);
  const isToggleable = isCategory && !isCustomCategory;
  const isEditing = editingId === node.id;
  const hasDuplicateDocumentTypeError =
    isEditing && hasDuplicateEditingDocumentTypeError;
  const isEditable = parentId === customCategoryId;
  const isCustomCategoryEmpty =
    isCustomCategory && (!node.children || node.children.length === 0);
  const rowStyle = { marginLeft: `${depth * 24}px` };

  // Toggleable rows never render the rename input or edit/delete actions
  // (those require `isEditable`/`isEditing`, which only apply to custom-category
  // leaves), so the whole row is a real <button> here without nesting any
  // interactive content. Non-toggleable rows stay a plain <div>.
  const rowInner = (
    <>
      {isCategory && (
        <span className="p-0.5">
          {isExpanded ? (
            <ChevronDown className="size-4 text-neutral-600" />
          ) : (
            <ChevronRight className="size-4 text-neutral-600" />
          )}
        </span>
      )}

      {isEditing ? (
        <div className="flex-1">
          <input
            ref={inputRef}
            type="text"
            value={editingValue}
            onChange={(event) => setEditingValue(event.target.value)}
            onBlur={confirmEdit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                confirmEdit();
              } else if (event.key === 'Escape') {
                cancelEdit();
              }
            }}
            aria-invalid={hasDuplicateDocumentTypeError ? true : undefined}
            aria-describedby={
              hasDuplicateDocumentTypeError
                ? `${node.id}-required-document-error`
                : undefined
            }
            aria-label={t('EditRequiredDocumentsDialog.editNameLabel', {
              name: node.name,
            })}
            className="focus-ring w-full rounded-md border border-border-primary bg-neutral-white px-2 py-1 text-[13px] leading-[18px] text-text-primary aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20"
          />
          {hasDuplicateDocumentTypeError ? (
            <p
              id={`${node.id}-required-document-error`}
              role="alert"
              className="mt-1 text-[13px] leading-[18px] text-error-600"
            >
              {t('EditRequiredDocumentsDialog.duplicateDocumentTypeError')}
            </p>
          ) : null}
        </div>
      ) : (
        <span
          className={cn(
            'flex-1 text-[13px] leading-[18px]',
            isCategory
              ? 'font-medium text-brand-950'
              : 'font-normal text-neutral-600',
          )}
        >
          {isCustomCategory
            ? t('DocumentTypeDropdown.customCategoryLabel')
            : node.name}
        </span>
      )}

      {isEditable && !isEditing && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            iconOnly
            aria-label={t('EditRequiredDocumentsDialog.editAriaLabel', {
              name: node.name,
            })}
            onClick={(event) => {
              event.stopPropagation();
              startEditing(node.id, node.name);
            }}
          >
            <Pencil />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            iconOnly
            aria-label={t('EditRequiredDocumentsDialog.deleteAriaLabel', {
              name: node.name,
            })}
            onClick={(event) => {
              event.stopPropagation();
              removeDocument(node.id);
            }}
          >
            <Trash2 />
          </Button>
        </>
      )}
    </>
  );

  return (
    <div>
      {isToggleable ? (
        <button
          type="button"
          aria-expanded={isExpanded}
          className={cn(
            ROW_CLASS_NAME,
            'focus-ring w-full cursor-pointer text-left',
          )}
          style={rowStyle}
          onClick={() => toggleNode(node.id)}
        >
          {rowInner}
        </button>
      ) : (
        <div className={ROW_CLASS_NAME} style={rowStyle}>
          {rowInner}
        </div>
      )}
      {isCategory && isExpanded && (
        <div className="mt-2 flex flex-col gap-2">
          {hasChildren
            ? node.children?.map((child) => (
                <RequiredDocumentsEditorNode
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  parentId={node.id}
                />
              ))
            : null}
        </div>
      )}
      {isCustomCategoryEmpty && isExpanded && (
        <p
          className="text-text-tertiary py-2 text-[13px] leading-[18px] italic"
          style={{ marginLeft: `${(depth + 1) * 24}px` }}
        >
          {t('EditRequiredDocumentsDialog.emptyCustomTypes')}
        </p>
      )}
    </div>
  );
};
