import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { ChevronDown, Plus } from 'lucide-react';
import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DeleteDialog } from '@/features/project/nachforderungen/sidebar-panel/DeleteDialog';
import { RequestForm } from '@/features/project/nachforderungen/sidebar-panel/RequestForm';
import { RequestListItemCard } from '@/features/project/nachforderungen/sidebar-panel/RequestListItemCard';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { Checkbox } from '@/features/ui/checkbox/Checkbox';
import { Button } from '@/features/ui/button/Button';
import { eq, useLiveInfiniteQuery } from '@tanstack/react-db';
import { toggleIncludedInLetter } from '../data/actions/requestItemActions';
import {
  REQUEST_ITEMS_PAGE_SIZE,
  createRequestItemsCollection,
} from '@/features/project/nachforderungen/data/collections/requestItems.collection';
import type { RequestItem } from '@/features/project/nachforderungen/data/schemas/requestItem.schema';

const route = getRouteApi('/verfahren/$verfahrenId/nachforderungen/');

/**
 * Owns the manual add form's open/close lifecycle, including the keyboard focus
 * handoff: focus moves into the form when it opens and returns to the add button
 * when it closes.
 */
export const RequestListPanel = () => {
  const { t } = useTranslation('SupplementaryRequests');
  const navigate = useNavigate();
  const { verfahrenId } = route.useParams();
  const { search = '' } = route.useSearch();
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const deferredSearch = useDeferredValue(search);
  // eslint-disable-next-line no-restricted-syntax -- each server-side search needs a stable native collection identity; inactive collections use TanStack DB's built-in GC.
  const collection = useMemo(
    () => createRequestItemsCollection(deferredSearch.trim() || undefined),
    [deferredSearch],
  );
  const {
    data: requestItems,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useLiveInfiniteQuery(
    (q) =>
      q
        .from({ items: collection })
        .where(({ items }) => eq(items.projectId, verfahrenId))
        .orderBy(({ items }) => items.createdAt, 'asc')
        .orderBy(({ items }) => items.id, 'asc'),
    { pageSize: REQUEST_ITEMS_PAGE_SIZE },
    [verfahrenId, deferredSearch],
  );

  // eslint-disable-next-line no-restricted-syntax -- ephemeral UI state for manual add form
  const [showManualForm, setShowManualForm] = useState(false);
  // eslint-disable-next-line no-restricted-syntax -- ephemeral UI state tracking which item is open for inline editing
  const [editingItem, setEditingItem] = useState<RequestItem | null>(null);
  // The add button only exists while the form is closed, so closing the form
  // cannot focus it synchronously. This flag asks the add button to take focus
  // the next time it mounts.
  const restoreAddButtonFocusRef = useRef(false);

  // Callback ref on the manual form container: focus the first field as soon as
  // the form mounts so keyboard users are not stranded on the now-removed add
  // button. Running this on mount avoids reacting to state with an effect.
  const focusFirstFieldOnMount = (node: HTMLDivElement | null) => {
    const firstField = node?.querySelector<HTMLElement>(
      'input, textarea, button, [tabindex]:not([tabindex="-1"])',
    );
    firstField?.focus();
  };

  // Callback ref on the add button: when it re-mounts after the form closes,
  // return focus to it so keyboard focus is not lost to the document body.
  const restoreFocusOnAddButtonMount = (node: HTMLButtonElement | null) => {
    if (node && restoreAddButtonFocusRef.current) {
      node.focus();
      restoreAddButtonFocusRef.current = false;
    }
  };

  const closeManualForm = () => {
    restoreAddButtonFocusRef.current = true;
    setShowManualForm(false);
  };

  const openDeleteDialog = (itemId: string) => {
    if (!canMutateProject) {
      return;
    }

    navigate({
      to: '.',
      search: (prev) => ({ ...prev, deleteRequestItemId: itemId }),
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <div className="flex h-0 min-h-0 flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto">
      <div className="flex flex-col gap-3">
        {requestItems.length === 0 && !showManualForm && (
          <p className="py-2 text-sm text-text-secondary">
            {t('RequestListPanel.emptyState')}
          </p>
        )}

        {requestItems.map((item) => (
          <div key={item.id} className="flex items-start gap-2">
            <div className="mt-1">
              <Checkbox
                checked={item.includedInLetter ? 'checked' : 'unchecked'}
                disabled={!canMutateProject}
                onCheckedChange={() => {
                  if (!canMutateProject) {
                    return;
                  }

                  toggleIncludedInLetter(item.id, collection);
                }}
                ariaLabel={t('RequestListPanel.checkboxAriaLabel', {
                  title: item.title,
                })}
              />
            </div>
            <div className="min-w-0 flex-1">
              <RequestListItemCard
                item={item}
                collection={collection}
                isEditing={editingItem?.id === item.id}
                canMutateProject={canMutateProject}
                onStartEditing={(i) => {
                  if (!canMutateProject) {
                    return;
                  }

                  setEditingItem(i);
                }}
                onDelete={(itemId) => {
                  if (!canMutateProject) {
                    return;
                  }

                  openDeleteDialog(itemId);
                }}
                onCloseEditing={() => setEditingItem(null)}
              />
            </div>
          </div>
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
            {t('RequestListPanel.loadMore')}
          </Button>
        )}
      </div>

      {showManualForm ? (
        <div
          ref={focusFirstFieldOnMount}
          className="overflow-hidden rounded-lg border-[0.5px] border-border-secondary bg-neutral-white"
        >
          <div className="flex items-center gap-2 border-b border-border-secondary bg-bg-secondary p-1">
            <ChevronDown className="size-4 shrink-0 text-text-secondary" />
            <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] font-medium tracking-[-0.13px] text-text-primary">
              {t('RequestListPanel.form.createTitle')}
            </span>
            <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px] font-medium text-text-secondary">
              {t('RequestListPanel.itemCountBadge', {
                count: requestItems.length,
              })}
            </span>
          </div>
          <div className="p-3">
            <RequestForm
              onClose={closeManualForm}
              canMutateProject={canMutateProject}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <Button
            ref={restoreFocusOnAddButtonMount}
            type="button"
            variant="ghost"
            size="sm"
            disabled={!canMutateProject}
            onClick={() => setShowManualForm(true)}
          >
            <Plus className="size-4" />
            {t('RequestListPanel.addDocument')}
          </Button>
          <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-[11px] font-medium text-text-secondary">
            {t('RequestListPanel.itemCountBadge', {
              count: requestItems.length,
            })}
          </span>
        </div>
      )}

      <DeleteDialog canMutateProject={canMutateProject} items={requestItems} />
    </div>
  );
};
