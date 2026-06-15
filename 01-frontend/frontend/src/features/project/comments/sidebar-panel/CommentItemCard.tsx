import type {
  CommentItem,
  CommentSource,
} from '@/features/project/comments/data/schemas/comment.schema';
import { getCommentSourceType } from '@/features/project/comments/data/schemas/comment.schema';
import { Badge } from '@/features/ui/badge/Badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/features/ui/collapsible/Collapsible';
import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { cn } from '@/features/ui/style/cn';
import { ChevronDown, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CommentForm } from './CommentForm';

const SIDEBAR_TEXT_MAX_LENGTH = 200;

const truncateSidebarText = (value: string) =>
  value.length > SIDEBAR_TEXT_MAX_LENGTH
    ? `${value.slice(0, SIDEBAR_TEXT_MAX_LENGTH)}...`
    : value;

const commentSourceMeta: Partial<
  Record<CommentSource, { badge: string; labelKey: string }>
> = {
  materialLaw: {
    badge: 'G',
    labelKey: 'Sidebar.commentsPanel.source.materialLaw',
  },
  materialNorm: {
    badge: 'N',
    labelKey: 'Sidebar.commentsPanel.source.materialNorm',
  },
  materialSatz: {
    badge: 'S',
    labelKey: 'Sidebar.commentsPanel.source.materialSatz',
  },
  materialFundstelle: {
    badge: 'F',
    labelKey: 'Sidebar.commentsPanel.source.materialFundstelle',
  },
};

type CommentItemCardProps = {
  item: CommentItem;
  dateLocale: string;
  isEditing: boolean;
  canMutateProject: boolean;
  onStartEditing: (item: CommentItem) => void;
  onDelete: (commentId: string) => void;
  onCloseEditing: () => void;
};

/** Renders a single comment as a collapsible card with edit/delete actions when expanded. */
export const CommentItemCard = (props: CommentItemCardProps) => {
  const {
    item,
    dateLocale,
    isEditing,
    canMutateProject,
    onStartEditing,
    onDelete,
    onCloseEditing,
  } = props;
  const { t } = useTranslation('Project');
  // eslint-disable-next-line no-restricted-syntax -- comment card expansion is local disclosure UI state.
  const [isOpen, setIsOpen] = useState(false);

  if (isEditing) {
    return (
      <CommentForm
        processStep={item.processStep}
        onClose={onCloseEditing}
        editItem={item}
        sourceRef={item.sourceRef}
        canMutateProject={canMutateProject}
      />
    );
  }

  const sourceType = getCommentSourceType(item);
  const sourceMeta = sourceType ? commentSourceMeta[sourceType] : undefined;
  const displayedTitle = isOpen ? item.title : truncateSidebarText(item.title);

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
        <TooltipWrapper content={item.title} side="left">
          <CollapsibleTrigger className="focus-ring flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left">
            <ChevronDown className="size-4 shrink-0 text-text-secondary transition-transform duration-200 [[data-state=closed]_&]:-rotate-90" />
            <span
              className={cn(
                'min-w-0 flex-1 truncate text-[13px] leading-[18px] tracking-[-0.13px]',
                isOpen
                  ? 'font-medium text-text-primary'
                  : 'font-normal text-text-secondary',
              )}
            >
              {displayedTitle}
            </span>
          </CollapsibleTrigger>
        </TooltipWrapper>
        <div className="flex shrink-0 items-center gap-1">
          {sourceType && sourceMeta && (
            <TooltipWrapper content={t(sourceMeta.labelKey)}>
              <Badge variant="secondary" size="small">
                {sourceMeta.badge}
              </Badge>
            </TooltipWrapper>
          )}
          <button
            type="button"
            disabled={!canMutateProject}
            onClick={() => onStartEditing(item)}
            className="focus-ring cursor-pointer rounded p-1 hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            aria-label={t('Sidebar.commentsPanel.actions.editAria')}
          >
            <Pencil className="size-4 text-text-secondary" />
          </button>
          <button
            type="button"
            disabled={!canMutateProject}
            onClick={() => onDelete(item.id)}
            className="focus-ring cursor-pointer rounded p-1 hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            aria-label={t('Sidebar.commentsPanel.actions.removeAria')}
          >
            <Trash2 className="size-4 text-text-secondary" />
          </button>
        </div>
      </div>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 p-3">
          <p className="text-[13px] leading-[18px] tracking-[-0.13px] text-text-primary">
            {item.content}
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
