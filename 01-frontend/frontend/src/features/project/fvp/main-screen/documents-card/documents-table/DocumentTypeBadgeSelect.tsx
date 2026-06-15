import type { RequiredDocumentNode } from '@/features/project/fvp/main-screen/data/schemas/requiredDocument.schema';
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuLabel,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { AI_SPARKLES_CHIP_BACKGROUND } from '@/features/ui/ai/AiSparklesChip';
import { AiSparklesIcon } from '@/features/ui/ai/AiSparklesIcon';
import { cn } from '@/features/ui/style/cn';
import { Check, ChevronDown, Link, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { BadgeSelect, type BadgeSelectVariant } from './BadgeSelect';
import { MENU_ITEM_CLASSES, MENU_ITEM_SELECTED_CLASSES } from './menuStyles';

export type DocumentTypeStatus =
  | { kind: 'unlinked' }
  | { kind: 'ai_suggestion'; label: string; selectedTypeId: string }
  | { kind: 'linked'; label: string; selectedTypeId: string };

type DocumentTypeBadgeSelectProps = {
  disabled?: boolean;
  status: DocumentTypeStatus;
  availableTypes: RequiredDocumentNode[];
  onConfirm?: () => void;
  onSelect?: (typeId: string) => void;
  onManageCustomDocumentTypes?: () => void;
};

type FlatType = { id: string; name: string };

const CUSTOM_CATEGORY_LABEL = 'benutzerdefiniert';

const isCustomCategory = (node: RequiredDocumentNode) =>
  node.children !== undefined &&
  node.name.trim().toLowerCase() === CUSTOM_CATEGORY_LABEL;

const flattenTypes = (nodes: RequiredDocumentNode[]): FlatType[] => {
  const out: FlatType[] = [];

  /**
   * Recursively visits the required-document tree and records leaf document types in display order.
   *
   * @param entries Required-document nodes at the current tree depth.
   * @returns Nothing; leaf types are appended to the surrounding accumulator.
   */
  const visit = (entries: RequiredDocumentNode[]) => {
    for (const entry of entries) {
      if (!entry.children) {
        out.push({ id: entry.id, name: entry.name });
        continue;
      }

      visit(entry.children);
    }
  };

  visit(nodes);
  return out;
};

const getTypeGroups = (nodes: RequiredDocumentNode[]) => {
  const standardNodes = nodes.filter((node) => !isCustomCategory(node));
  const customNodes = nodes.filter(isCustomCategory);

  return {
    standardTypes: flattenTypes(standardNodes),
    customTypes: customNodes.flatMap((node) =>
      flattenTypes(node.children ?? []),
    ),
  };
};

const ICON_BUTTON_CLASSES =
  'focus-ring inline-flex size-6 shrink-0 items-center justify-center rounded-[4px] text-text-secondary transition-colors hover:bg-neutral-100 disabled:pointer-events-none disabled:opacity-60';

/**
 * Renders the document-type badge with the matching select, AI confirmation, and custom-type management actions for the current link status.
 *
 * @param props Current document-type status plus optional action handlers.
 * @returns Badge select controls for the document-type status.
 */
export const DocumentTypeBadgeSelect = (
  props: DocumentTypeBadgeSelectProps,
) => {
  const {
    disabled = false,
    status,
    availableTypes,
    onConfirm,
    onSelect,
    onManageCustomDocumentTypes,
  } = props;
  const { t } = useTranslation('FormalCompletenessCheck');

  const { standardTypes, customTypes } = getTypeGroups(availableTypes);
  const hasCustomSection =
    customTypes.length > 0 || onManageCustomDocumentTypes !== undefined;
  const hasSelectableTypes = standardTypes.length > 0 || customTypes.length > 0;
  const selectedTypeId =
    status.kind === 'unlinked' ? null : status.selectedTypeId;

  const renderTypeMenuItem = (type: FlatType) => {
    const isSelected = type.id === selectedTypeId;

    return (
      <ActionMenuRadioItem
        key={type.id}
        value={type.id}
        disabled={disabled}
        // Keep the menu open on select; ActionMenuRadioGroup.onValueChange still fires.
        onSelect={(event) => event.preventDefault()}
        className={cn(
          MENU_ITEM_CLASSES,
          isSelected && MENU_ITEM_SELECTED_CLASSES,
        )}
      >
        <span
          className={cn(
            'truncate text-[11px] leading-[14px] font-medium tracking-[0.22px]',
            isSelected ? 'text-neutral-white' : 'text-slate-300',
          )}
        >
          {type.name}
        </span>
        {isSelected && (
          <Check className="size-4 text-neutral-white" aria-hidden />
        )}
      </ActionMenuRadioItem>
    );
  };

  const renderTypeMenuItems = () => {
    if (!hasSelectableTypes && !hasCustomSection) {
      return (
        <ActionMenuItem disabled className={MENU_ITEM_CLASSES}>
          {t('DocumentTypeDropdown.emptyTypes')}
        </ActionMenuItem>
      );
    }

    return (
      <>
        <ActionMenuRadioGroup
          value={selectedTypeId ?? ''}
          onValueChange={(typeId) => onSelect?.(typeId)}
        >
          {standardTypes.map(renderTypeMenuItem)}
          {hasCustomSection && (
            <>
              <ActionMenuLabel className="px-2 pt-2 pb-1 text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-400 normal-case">
                {t('DocumentTypeDropdown.customCategoryLabel')}
              </ActionMenuLabel>
              {customTypes.map(renderTypeMenuItem)}
            </>
          )}
        </ActionMenuRadioGroup>
        {onManageCustomDocumentTypes && (
          <ActionMenuItem
            disabled={disabled}
            onSelect={(event) => {
              event.preventDefault();
              onManageCustomDocumentTypes();
            }}
            className={MENU_ITEM_CLASSES}
          >
            {t('DocumentTypeDropdown.manageLabel')}
          </ActionMenuItem>
        )}
      </>
    );
  };

  if (status.kind === 'ai_suggestion') {
    return (
      <div className="inline-flex w-fit items-center gap-1 rounded-[8px] bg-neutral-50 p-1">
        <span
          className="inline-flex min-w-0 items-center gap-1 rounded-[4px] border-[0.5px] border-transparent px-2 py-1 shadow-elevated"
          style={{ background: AI_SPARKLES_CHIP_BACKGROUND }}
        >
          <span className="inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">
            <AiSparklesIcon className="size-4 shrink-0" />
          </span>
          <span className="block max-w-44 truncate bg-gradient-to-b from-purple-600 to-purple-900 bg-clip-text text-left text-[11px] leading-[14px] font-medium tracking-[0.02em] text-transparent">
            {status.label}
          </span>
        </span>
        {disabled ? (
          <button
            type="button"
            aria-label={t('DocumentTypeDropdown.ariaLabel')}
            className={ICON_BUTTON_CLASSES}
            disabled
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </button>
        ) : (
          <ActionMenu>
            <ActionMenuTrigger asChild>
              <button
                type="button"
                aria-label={t('DocumentTypeDropdown.ariaLabelWithValue', {
                  value: status.label,
                })}
                className={ICON_BUTTON_CLASSES}
              >
                <ChevronDown className="size-4" aria-hidden="true" />
              </button>
            </ActionMenuTrigger>
            <ActionMenuContent
              align="start"
              className="max-h-80 min-w-56 overflow-y-auto"
            >
              {renderTypeMenuItems()}
            </ActionMenuContent>
          </ActionMenu>
        )}
        {onConfirm && (
          <button
            type="button"
            aria-label={t('DocumentTypeDropdown.confirmAriaLabel', {
              value: status.label,
            })}
            onClick={onConfirm}
            className={ICON_BUTTON_CLASSES}
            disabled={disabled}
          >
            <Check className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  const variant: BadgeSelectVariant =
    status.kind === 'unlinked' ? 'neutral' : 'default';
  const icon =
    status.kind === 'unlinked' ? (
      <Plus aria-hidden="true" />
    ) : (
      <Link aria-hidden="true" />
    );
  const label =
    status.kind === 'unlinked'
      ? t('DocumentTypeDropdown.selectLabel')
      : status.label;

  return (
    <BadgeSelect
      variant={variant}
      icon={icon}
      label={label}
      ariaLabel={
        status.kind === 'unlinked'
          ? t('DocumentTypeDropdown.ariaLabel')
          : t('DocumentTypeDropdown.ariaLabelWithValue', { value: label })
      }
      align="start"
      contentClassName="max-h-80 overflow-y-auto"
      disabled={disabled}
    >
      {renderTypeMenuItems()}
    </BadgeSelect>
  );
};
