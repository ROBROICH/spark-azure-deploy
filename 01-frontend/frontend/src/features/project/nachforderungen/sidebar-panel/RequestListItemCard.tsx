import { PRIORITY_BADGE_VARIANT } from '@/features/project/nachforderungen/data/requestItemPresentation';
import type {
  RequestItem,
  RequestItemPriority,
} from '@/features/project/nachforderungen/data/schemas/requestItem.schema';
import { Badge } from '@/features/ui/badge/Badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/features/ui/collapsible/Collapsible';
import { getDateLocale } from '@/i18n/dateLocale';
import { cn } from '@/features/ui/style/cn';
import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RequestForm } from './RequestForm';
import type { requestItemsCollection } from '../data/collections/requestItems.collection';

type RequestListItemCardProps = {
  item: RequestItem;
  collection?: typeof requestItemsCollection;
  isEditing: boolean;
  canMutateProject: boolean;
  onStartEditing: (item: RequestItem) => void;
  onDelete: (itemId: string) => void;
  onCloseEditing: () => void;
};

export const RequestListItemCard = (props: RequestListItemCardProps) => {
  const {
    item,
    collection,
    isEditing,
    canMutateProject,
    onStartEditing,
    onDelete,
    onCloseEditing,
  } = props;
  const { t, i18n } = useTranslation('SupplementaryRequests');
  const dateLocale = getDateLocale(i18n.resolvedLanguage);
  // eslint-disable-next-line no-restricted-syntax -- request item expansion is local disclosure UI state.
  const [isOpen, setIsOpen] = useState(false);
  const priorityLabels: Record<RequestItemPriority, string> = {
    must: t('RequestListPanel.priority.must'),
    should: t('RequestListPanel.priority.should'),
  };

  if (isEditing) {
    return (
      <RequestForm
        onClose={onCloseEditing}
        editItem={item}
        collection={collection}
        canMutateProject={canMutateProject}
      />
    );
  }

  return (
    <Collapsible
      className="shrink-0 overflow-hidden rounded-lg border-[0.5px] border-border-secondary bg-neutral-white"
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <div
        className={cn(
          'flex w-full items-center gap-2 p-1',
          isOpen && 'border-b border-border-secondary',
          isOpen ? 'bg-bg-secondary' : 'bg-neutral-white',
        )}
      >
        <CollapsibleTrigger className="focus-ring flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
          <ChevronDown className="size-4 shrink-0 text-text-secondary transition-transform duration-200 [[data-state=closed]_&]:-rotate-90" />
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[13px] leading-[18px] tracking-[-0.13px]',
              isOpen
                ? 'font-medium text-text-primary'
                : 'font-normal text-text-secondary',
            )}
            title={item.title}
          >
            {item.title}
          </span>
        </CollapsibleTrigger>
        <div className="flex shrink-0 items-center gap-1">
          <Badge
            variant={PRIORITY_BADGE_VARIANT[item.priority]}
            size="small"
            className="text-xs"
          >
            {priorityLabels[item.priority]}
          </Badge>
          {/* Note: Source metadata exists on request items but is hidden until we have a clearer UX for it. */}
          <button
            type="button"
            disabled={!canMutateProject}
            onClick={() => onStartEditing(item)}
            className="focus-ring cursor-pointer rounded p-1 hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            aria-label={t('RequestListPanel.actions.editAria')}
          >
            <Pencil className="size-4 text-text-secondary" />
          </button>
          <button
            type="button"
            disabled={!canMutateProject}
            onClick={() => onDelete(item.id)}
            className="focus-ring cursor-pointer rounded p-1 hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            aria-label={t('RequestListPanel.actions.removeAria')}
          >
            <Trash2 className="size-4 text-text-secondary" />
          </button>
        </div>
      </div>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 p-3">
          <p className="text-[13px] leading-[18px] tracking-[-0.13px] text-text-primary">
            {item.reason}
          </p>
          <p className="text-[11px] leading-[14px] font-medium tracking-[0.22px] text-text-secondary">
            {new Date(item.createdAt).toLocaleDateString(dateLocale, {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
            ,{' '}
            {new Date(item.createdAt).toLocaleTimeString(dateLocale, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
