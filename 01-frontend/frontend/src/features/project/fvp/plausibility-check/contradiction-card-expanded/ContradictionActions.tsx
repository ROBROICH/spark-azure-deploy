import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { commentSidebarSearchUpdate } from '@/features/project/action-sidebar/commentSidebarNav';
import { toast } from '@/features/ui/toast/Toast';
import { Button } from '@/features/ui/button/Button';
import {
  markAsIgnored,
  resetToOpen,
} from '../data/actions/contradictionActions';
import type { ContradictionListItem } from '../data/read-model/useContradictions';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/pp/');
const ACTION_BUTTON_CLASS_NAME = 'h-auto py-2';
const ACTION_PRIMARY_BUTTON_CLASS_NAME = `${ACTION_BUTTON_CLASS_NAME} border border-transparent`;

type ContradictionActionsProps = {
  contradiction: ContradictionListItem;
};

type PendingAction = 'ignore' | 'request-list' | 'restore' | null;

/**
 * Owns all mutation-capable contradiction actions, including the project-write
 * permission gate and optimistic-transaction persistence feedback.
 */
export const ContradictionActions = (props: ContradictionActionsProps) => {
  const { contradiction } = props;
  const { t } = useTranslation('PlausibilityCheck');
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const navigate = useNavigate();
  const { previewDocumentId } = route.useSearch();
  // eslint-disable-next-line no-restricted-syntax -- pending action state is ephemeral UI feedback for local button loading/disable states.
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const stackActions = Boolean(previewDocumentId);
  const documentNames = [
    ...new Set(
      contradiction.occurrences.map((occurrence) =>
        typeof occurrence.documentName === 'string' &&
        occurrence.documentName.length > 0
          ? occurrence.documentName
          : occurrence.documentId,
      ),
    ),
  ];
  const commentTitlePrefix = t('ContradictionActions.commentTitlePrefix');
  const commentTitleSuffix = documentNames
    .filter((name) => name.length > 0)
    .join(', ');
  const commentTitle = commentTitleSuffix
    ? `${commentTitlePrefix} ${commentTitleSuffix}`
    : commentTitlePrefix;
  const areActionsDisabled = !canMutateProject || pendingAction !== null;

  const persistMutation = async (
    nextPendingAction: NonNullable<PendingAction>,
    runMutation: () => ReturnType<typeof markAsIgnored>,
  ) => {
    if (!canMutateProject) {
      return false;
    }

    setPendingAction(nextPendingAction);
    let didPersist = false;
    try {
      const tx = runMutation();
      await tx.isPersisted.promise;
      didPersist = true;
    } catch {
      toast.error(t('ContradictionActions.saveError'));
    }
    setPendingAction(null);
    return didPersist;
  };

  const handleMarkAsIgnored = async () => {
    await persistMutation('ignore', () => markAsIgnored(contradiction.id));
  };

  const handleStopIgnoring = async () => {
    await persistMutation('restore', () => resetToOpen(contradiction.id));
  };

  /** Restores ignored items before routing into the request-list draft flow. */
  const handleAddToRequestList = async () => {
    if (!canMutateProject || contradiction.isOnRequestList) {
      return;
    }

    if (contradiction.status === 'IGNORED') {
      const hasRestoredStatus = await persistMutation('request-list', () =>
        resetToOpen(contradiction.id),
      );
      if (!hasRestoredStatus) {
        return;
      }
    }

    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        sidebarPanel: 'requestList',
        newRequestListInitItems: [
          {
            title: contradiction.description,
            sourceRef: {
              type: 'contradiction',
              itemId: contradiction.id,
            },
          },
        ],
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const handleAddComment = () => {
    if (!canMutateProject) {
      return;
    }

    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        ...commentSidebarSearchUpdate({
          title: commentTitle,
          content: contradiction.description,
        }),
      }),
      replace: true,
      resetScroll: false,
    });
  };

  if (contradiction.status === 'IGNORED') {
    return (
      <div
        className={
          stackActions
            ? 'grid grid-cols-1 justify-items-stretch gap-3 rounded-xl bg-slate-50 p-4'
            : 'flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4'
        }
      >
        <Button
          variant="secondary"
          size="sm"
          className={ACTION_BUTTON_CLASS_NAME}
          loading={pendingAction === 'restore'}
          onClick={handleStopIgnoring}
          disabled={areActionsDisabled}
        >
          {t('ContradictionActions.stopIgnoringHint')}
        </Button>
        <div
          className={
            stackActions
              ? 'flex w-full flex-col gap-2'
              : 'flex items-center justify-end gap-2'
          }
        >
          <Button
            variant="secondary"
            size="sm"
            className={ACTION_BUTTON_CLASS_NAME}
            onClick={handleAddComment}
            disabled={areActionsDisabled}
          >
            {t('ContradictionActions.addComment')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            className={ACTION_PRIMARY_BUTTON_CLASS_NAME}
            loading={pendingAction === 'request-list'}
            onClick={handleAddToRequestList}
            disabled={areActionsDisabled || contradiction.isOnRequestList}
          >
            {t('ContradictionActions.addToRequestList')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        stackActions
          ? 'grid grid-cols-1 justify-items-stretch gap-3 rounded-xl bg-slate-50 p-4'
          : 'flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-4'
      }
    >
      <Button
        variant="secondary"
        size="sm"
        className={ACTION_BUTTON_CLASS_NAME}
        loading={pendingAction === 'ignore'}
        onClick={handleMarkAsIgnored}
        disabled={areActionsDisabled}
      >
        {t('ContradictionActions.ignoreHint')}
      </Button>
      <div
        className={
          stackActions
            ? 'flex w-full flex-col gap-2'
            : 'flex items-center justify-end gap-2'
        }
      >
        <Button
          variant="secondary"
          size="sm"
          className={ACTION_BUTTON_CLASS_NAME}
          onClick={handleAddComment}
          disabled={areActionsDisabled}
        >
          {t('ContradictionActions.addComment')}
        </Button>
        <Button
          variant="primary"
          size="sm"
          className={ACTION_PRIMARY_BUTTON_CLASS_NAME}
          onClick={handleAddToRequestList}
          disabled={areActionsDisabled || contradiction.isOnRequestList}
        >
          {t('ContradictionActions.addToRequestList')}
        </Button>
      </div>
    </div>
  );
};
