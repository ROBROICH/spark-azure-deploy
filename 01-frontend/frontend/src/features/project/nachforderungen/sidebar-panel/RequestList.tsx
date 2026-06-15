import { Button } from '@/features/ui/button/Button';
import {
  Close as SheetClose,
  Title as SheetTitle,
} from '@radix-ui/react-dialog';
import { Link, getRouteApi, useNavigate } from '@tanstack/react-router';
import { ChevronDown, ClipboardList, Plus, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { requestItemsCollection } from '@/features/project/nachforderungen/data/collections/requestItems.collection';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import type { RequestItem } from '@/features/project/nachforderungen/data/schemas/requestItem.schema';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useTranslation } from 'react-i18next';
import { SidebarListState } from '@/features/project/action-sidebar/SidebarListState';
import { SidebarPanelHeader } from '@/features/project/action-sidebar/SidebarPanelHeader';
import { SidebarPanelShell } from '@/features/project/action-sidebar/SidebarPanelShell';
import { DeleteDialog } from './DeleteDialog';
import { RequestForm } from './RequestForm';
import { RequestListItemCard } from './RequestListItemCard';

// Use the layout route for request list state (shared across FVP, PP and MVP)
const route = getRouteApi('/verfahren/$verfahrenId');

type RequestListProps = {
  open: boolean;
  onClose: () => void;
  sidebarExpanded: boolean;
};

/**
 * Request List (Nachforderungsliste) panel component.
 * Shows a flat list of all follow-up requests.
 */
export const RequestList = (props: RequestListProps) => {
  const { open, onClose, sidebarExpanded } = props;
  const { t } = useTranslation('SupplementaryRequests');
  const navigate = useNavigate();

  const { verfahrenId } = route.useParams();
  const { newRequestListInitItems } = route.useSearch();
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const {
    data: requestItemsData,
    isLoading,
    isError,
  } = useLiveQuery((q) =>
    q
      .from({ items: requestItemsCollection })
      .where(({ items }) => eq(items.projectId, verfahrenId)),
  );
  const refetchRequestItems = () => requestItemsCollection.utils.refetch();
  const requestItems = [...requestItemsData].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateA - dateB;
  });

  const contentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line no-restricted-syntax -- Scroll to top on panel mount
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, []);

  const openDeleteDialog = (itemId: string) => {
    if (!canMutateProject) {
      return;
    }

    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        deleteRequestItemId: itemId,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  // eslint-disable-next-line no-restricted-syntax -- manual request form visibility is transient drawer UI state before submission.
  const [showManualForm, setShowManualForm] = useState(false);
  // eslint-disable-next-line no-restricted-syntax -- the edited request draft is local form state until save or cancel.
  const [editingItem, setEditingItem] = useState<RequestItem | null>(null);

  const startEditing = (item: RequestItem) => {
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
        if (!prev.newRequestListInitItems) {
          return prev;
        }

        const remaining = prev.newRequestListInitItems.filter(
          (_, i) => i !== index,
        );

        return {
          ...prev,
          newRequestListInitItems: remaining.length > 0 ? remaining : undefined,
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
        icon={ClipboardList}
        title={t('RequestListPanel.title')}
        titleWrapper={SheetTitle}
      >
        <div className="flex items-center gap-1">
          <Button asChild size="default" variant="primary">
            <Link
              to="/verfahren/$verfahrenId/nachforderungen"
              params={{ verfahrenId }}
              search={{}}
            >
              {t('RequestListPanel.exportShort')}
            </Link>
          </Button>
          <SheetClose asChild>
            <Button
              variant="ghost"
              size="default"
              iconOnly
              aria-label={t('RequestListPanel.close')}
            >
              <X />
            </Button>
          </SheetClose>
        </div>
      </SidebarPanelHeader>

      {/* Content */}
      <div
        ref={contentRef}
        className="flex h-0 min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain p-4"
      >
        {/* URL-initiated pre-filled forms */}
        {(newRequestListInitItems ?? []).map((item, index) => (
          <RequestForm
            key={`${item.sourceRef?.itemId ?? item.documentId ?? item.title}-${index}`}
            onClose={() => removeInitItemFromUrl(index)}
            initialTitle={item.title}
            sourceRef={item.sourceRef}
            topicId={item.topicId}
            documentId={item.documentId}
            canMutateProject={canMutateProject}
          />
        ))}

        {/* Flat item list */}
        <SidebarListState
          isLoading={isLoading}
          isError={isError}
          loadingAriaLabel={t('RequestListPanel.loadingAria')}
          errorMessage={t('RequestListPanel.loadError')}
          retryLabel={t('RequestListPanel.retry')}
          onRetry={refetchRequestItems}
        >
          {requestItems.length === 0 &&
            !showManualForm &&
            (newRequestListInitItems ?? []).length === 0 && (
              <p className="py-2 text-sm text-text-secondary">
                {t('RequestListPanel.emptyState')}
              </p>
            )}

          {requestItems.map((item) => (
            <RequestListItemCard
              key={item.id}
              item={item}
              isEditing={editingItem?.id === item.id}
              onStartEditing={startEditing}
              onDelete={openDeleteDialog}
              onCloseEditing={stopEditing}
              canMutateProject={canMutateProject}
            />
          ))}
        </SidebarListState>

        {showManualForm ? (
          <div className="shrink-0 overflow-hidden rounded-lg border-[0.5px] border-border-secondary bg-neutral-white">
            <div className="flex items-center gap-2 border-b border-border-secondary bg-bg-secondary p-1">
              <ChevronDown className="size-4 shrink-0 text-text-secondary" />
              <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] font-medium tracking-[-0.13px] text-text-primary">
                {t('RequestListPanel.addDocument')}
              </span>
            </div>
            <div className="p-3">
              <RequestForm
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
              withIcon
              disabled={!canMutateProject}
              onClick={() => setShowManualForm(true)}
            >
              <Plus />
              {t('RequestListPanel.addDocument')}
            </Button>

            <span className="shrink-0 rounded border border-slate-400 bg-white px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.22px] text-slate-600">
              {t('RequestListPanel.itemCountBadge', {
                count: requestItems.length,
              })}
            </span>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <DeleteDialog canMutateProject={canMutateProject} />
    </SidebarPanelShell>
  );
};
