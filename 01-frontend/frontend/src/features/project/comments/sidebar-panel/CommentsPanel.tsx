import { Button } from '@/features/ui/button/Button';
import {
  Close as SheetClose,
  Title as SheetTitle,
} from '@radix-ui/react-dialog';
import {
  getRouteApi,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router';
import { ChevronDown, MessageSquare, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useComments } from '@/features/project/comments/data/read-model/useComments';
import type {
  CommentItem,
  CommentProcessStep,
} from '@/features/project/comments/data/schemas/comment.schema';
import { getDateLocale } from '@/i18n/dateLocale';
import { SidebarListState } from '@/features/project/action-sidebar/SidebarListState';
import { SidebarPanelHeader } from '@/features/project/action-sidebar/SidebarPanelHeader';
import { SidebarPanelShell } from '@/features/project/action-sidebar/SidebarPanelShell';
import { CommentForm } from './CommentForm';
import { CommentItemCard } from './CommentItemCard';
import { DeleteDialog } from './DeleteDialog';

// Use the layout route for comment state (shared across steps)
const route = getRouteApi('/verfahren/$verfahrenId');

const COMMENT_PROCESS_STEPS: CommentProcessStep[] = [
  'unsorted',
  'formalCompletenessCheck',
  'plausibilityCheck',
  'materialCompletenessCheck',
  'legalReview',
];

const processStepByPath: [string, CommentProcessStep][] = [
  ['/fvp/pp', 'plausibilityCheck'],
  ['/mvp', 'materialCompletenessCheck'],
  ['/rpb', 'legalReview'],
  ['/fvp/', 'formalCompletenessCheck'],
];

type CommentsPanelProps = {
  open: boolean;
  onClose: () => void;
  sidebarExpanded: boolean;
};

/**
 * Owns comments sidebar state for route-derived process-step defaults, manual
 * drafts, edit mode, and delete-dialog routing.
 */
export const CommentsPanel = (props: CommentsPanelProps) => {
  const { open, onClose, sidebarExpanded } = props;
  const navigate = useNavigate();
  const { t, i18n } = useTranslation('Project');
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const { verfahrenId } = route.useParams();
  const { newCommentInitItems } = route.useSearch();
  const {
    comments,
    isLoading,
    isError,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useComments(verfahrenId);
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });

  const currentProcessStep: CommentProcessStep =
    processStepByPath.find(([segment]) => currentPath.includes(segment))?.[1] ??
    'unsorted';

  const contentRef = useRef<HTMLDivElement>(null);
  const dateLocale = getDateLocale(i18n.resolvedLanguage);

  // eslint-disable-next-line no-restricted-syntax -- Scroll to top on panel mount
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, []);

  const openDeleteDialog = (commentId: string) => {
    if (!canMutateProject) {
      return;
    }

    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        deleteCommentId: commentId,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  // eslint-disable-next-line no-restricted-syntax -- manual comment form visibility is transient drawer UI state before submission.
  const [showManualForm, setShowManualForm] = useState(false);
  // eslint-disable-next-line no-restricted-syntax -- the edited comment draft is local form state until save or cancel.
  const [editingItem, setEditingItem] = useState<CommentItem | null>(null);

  const startEditing = (item: CommentItem) => {
    if (!canMutateProject) {
      return;
    }

    setEditingItem(item);
  };
  const stopEditing = () => setEditingItem(null);

  const removeInitItemFromUrl = (index: number) => {
    navigate({
      to: '.',
      search: (prev) => {
        if (!prev.newCommentInitItems) {
          return prev;
        }

        const remaining = prev.newCommentInitItems.filter(
          (_, i) => i !== index,
        );

        return {
          ...prev,
          newCommentInitItems: remaining.length > 0 ? remaining : undefined,
        };
      },
      resetScroll: false,
    });
  };

  return (
    <SidebarPanelShell
      open={open}
      onClose={onClose}
      sidebarExpanded={sidebarExpanded}
    >
      {/* Header */}
      <SidebarPanelHeader
        icon={MessageSquare}
        title={t('Sidebar.comments')}
        titleWrapper={SheetTitle}
      >
        <SheetClose asChild>
          <Button
            variant="ghost"
            size="default"
            iconOnly
            aria-label={t('Sidebar.close')}
          >
            <X className="size-4" />
          </Button>
        </SheetClose>
      </SidebarPanelHeader>

      {/* Content */}
      <div
        ref={contentRef}
        className="flex h-0 min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4"
      >
        {/* URL-initiated pre-filled forms */}
        {(newCommentInitItems ?? []).map((item, index) => (
          <CommentForm
            key={`${item.title}-${index}`}
            processStep={item.processStep ?? currentProcessStep}
            onClose={() => removeInitItemFromUrl(index)}
            initialTitle={item.title}
            initialContent={item.content}
            sourceRef={
              item.sourceRef ??
              (item.source ? { type: item.source } : undefined)
            }
            canMutateProject={canMutateProject}
            scrollIntoViewOnMount={
              index === (newCommentInitItems ?? []).length - 1
            }
          />
        ))}

        {/* Flat comment list */}
        <SidebarListState
          isLoading={isLoading}
          isError={isError}
          loadingAriaLabel={t('Sidebar.commentsPanel.loadingAria')}
          errorMessage={t('Sidebar.commentsPanel.loadError')}
          retryLabel={t('Sidebar.commentsPanel.retry')}
          onRetry={refetch}
        >
          {comments.length === 0 &&
            !showManualForm &&
            (newCommentInitItems ?? []).length === 0 && (
              <p className="py-2 text-sm text-text-secondary">
                {t('Sidebar.commentsPanel.empty')}
              </p>
            )}

          {comments.map((item) => (
            <CommentItemCard
              key={item.id}
              item={item}
              dateLocale={dateLocale}
              isEditing={editingItem?.id === item.id}
              onStartEditing={startEditing}
              onDelete={openDeleteDialog}
              onCloseEditing={stopEditing}
              canMutateProject={canMutateProject}
            />
          ))}

          {hasNextPage && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="self-start"
              disabled={isFetchingNextPage}
              onClick={fetchNextPage}
            >
              {t('Sidebar.commentsPanel.loadMore')}
            </Button>
          )}
        </SidebarListState>

        {showManualForm ? (
          <div className="shrink-0 overflow-hidden rounded-lg border-[0.5px] border-border-secondary bg-neutral-white">
            <div className="flex items-center gap-2 border-b border-border-secondary bg-bg-secondary p-1">
              <ChevronDown className="size-4 shrink-0 text-text-secondary" />
              <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] font-medium tracking-[-0.13px] text-text-primary">
                {t('Sidebar.commentsPanel.addComment')}
              </span>
            </div>
            <div className="p-3">
              <CommentForm
                processStepOptions={COMMENT_PROCESS_STEPS}
                onClose={() => setShowManualForm(false)}
                canMutateProject={canMutateProject}
              />
            </div>
          </div>
        ) : (
          <div className="flex shrink-0 items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!canMutateProject}
              onClick={() => setShowManualForm(true)}
            >
              <Plus className="size-4" />
              {t('Sidebar.commentsPanel.addComment')}
            </Button>
            <span className="shrink-0 rounded border border-slate-400 bg-white px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.22px] text-slate-600">
              {t('Sidebar.commentsPanel.countLabel', {
                count: comments.length,
              })}
            </span>
          </div>
        )}
      </div>

      <DeleteDialog canMutateProject={canMutateProject} items={comments} />
    </SidebarPanelShell>
  );
};
