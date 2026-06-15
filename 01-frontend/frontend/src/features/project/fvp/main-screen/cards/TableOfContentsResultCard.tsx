import { tocNotesCollection } from '@/features/project/fvp/main-screen/data/collections/tocNotes.collection';
import { useTableOfContentsDocuments } from '@/features/project/fvp/main-screen/data/read-model/useTableOfContentsDocuments';
import { CollectionErrorAlert } from '@/features/project/fvp/main-screen/read-status/CollectionErrorAlert';
import { notifyOnPersistenceFailure } from '@/features/project/fvp/main-screen/read-status/notifyOnPersistenceFailure';
import { retryTableOfContentsReads } from '@/features/project/fvp/data/fvpResultReads';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import {
  commentSidebarSearchUpdate,
  requestSidebarSearchUpdate,
} from '@/features/project/action-sidebar/sidebarSearchParams';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ResultCard,
  type ResultCardHint,
  type ResultCardHintAction,
  type ResultCardHintStatus,
} from './ResultCard';
import { ResultCardSkeleton } from './ResultCardSkeleton';
import {
  ResultCardRequestAllButton,
  ResultCardShowMoreButton,
} from './resultCardActions';

const COLLAPSED_HINTS = 3;
const EXPANDED_LIST_CLASS = 'max-h-[592px] overflow-y-auto';

const STATUS_ORDER = {
  open: 0,
  requested: 1,
  irrelevant: 2,
} satisfies Record<TocHintStatus, number>;

type TocHintStatus = Extract<
  ResultCardHintStatus,
  'open' | 'requested' | 'irrelevant'
>;

const route = getRouteApi('/verfahren/$verfahrenId/fvp/documents/');

type TableOfContentsResultCardProps = {
  projectId: string;
};

/**
 * Renders the table-of-contents result card with sorted hints and sidebar
 * actions for comments, request-list entries, and hide/show state.
 *
 * @param props Card props containing the active project id.
 * @returns The TOC result card or its loading skeleton.
 */
export const TableOfContentsResultCard = (
  props: TableOfContentsResultCardProps,
) => {
  const { projectId } = props;
  const { t } = useTranslation('FormalCompletenessCheck');
  const navigate = route.useNavigate();
  const { canMutateProject } = useCanMutateProject({
    requiredLevel: 'user',
  });
  // eslint-disable-next-line no-restricted-syntax -- expand toggle is local card UI state
  const [isExpanded, setIsExpanded] = useState(false);
  const { items, isLoading, isError } = useTableOfContentsDocuments(projectId);

  if (isLoading) {
    return <ResultCardSkeleton />;
  }

  if (isError) {
    return (
      <CollectionErrorAlert
        onRetry={() => retryTableOfContentsReads(projectId)}
      />
    );
  }

  const hints = items
    .map((item) => {
      let status: TocHintStatus = 'open';
      if (item.isResolved) {
        status = 'irrelevant';
      } else if (item.isOnRequestList) {
        status = 'requested';
      }
      return { id: item.id, name: item.name, status };
    })
    .sort((a, b) => {
      const order = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (order !== 0) {
        return order;
      }
      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });

  const totalItems = hints.length;
  const openCount = hints.filter((hint) => hint.status === 'open').length;
  const processedCount = totalItems - openCount;

  /**
   * Builds the kebab menu entries for one TOC hint based on its derived status.
   *
   * @param hint Hint with derived status and display name.
   * @returns Action menu entries for the hint row.
   */
  // eslint-disable-next-line custom-size/limit-logic-function-lines -- the menu cases stay together so status-specific sidebar and visibility actions remain auditable in one place.
  const buildActions = (hint: {
    id: string;
    name: string;
    status: TocHintStatus;
  }): ResultCardHintAction[] => {
    if (!canMutateProject) {
      return [];
    }

    const actions: ResultCardHintAction[] = [];

    if (hint.status === 'requested') {
      actions.push({
        id: 'open-requests',
        labelKey: 'redesign.tableOfContentsCard.menu.openRequests',
        onSelect: () => {
          navigate({
            to: '/verfahren/$verfahrenId/fvp/documents',
            params: { verfahrenId: projectId },
            search: (prev) => ({
              ...prev,
              sidebarPanel: 'requestList' as const,
            }),
            replace: true,
            resetScroll: false,
          });
        },
      });
    } else if (hint.status === 'open') {
      actions.push({
        id: 'request',
        labelKey: 'redesign.tableOfContentsCard.menu.request',
        // eslint-disable-next-line custom-jsdoc/require-jsdoc-complexity -- the callback assembles route search state for one menu command.
        onSelect: () => {
          navigate({
            to: '/verfahren/$verfahrenId/fvp/documents',
            params: { verfahrenId: projectId },
            search: (prev) => ({
              ...prev,
              ...requestSidebarSearchUpdate({
                title: hint.name,
                sourceRef: { type: 'tableOfContents', itemId: hint.id },
              }),
            }),
            replace: true,
            resetScroll: false,
          });
        },
      });
    }

    actions.push({
      id: 'add-comment',
      labelKey: 'redesign.tableOfContentsCard.menu.addComment',
      onSelect: () => {
        navigate({
          to: '/verfahren/$verfahrenId/fvp/documents',
          params: { verfahrenId: projectId },
          search: (prev) => ({
            ...prev,
            ...commentSidebarSearchUpdate(hint.name),
          }),
          replace: true,
          resetScroll: false,
        });
      },
    });

    if (hint.status === 'irrelevant') {
      actions.push({
        id: 'show-hint',
        labelKey: 'redesign.tableOfContentsCard.menu.showHint',
        onSelect: () => {
          notifyOnPersistenceFailure(
            tocNotesCollection.update(hint.id, (draft) => {
              draft.isResolved = false;
            }),
            t('common.errors.actionFailed'),
          );
        },
      });
    } else {
      actions.push({
        id: 'hide-hint',
        labelKey: 'redesign.tableOfContentsCard.menu.hideHint',
        onSelect: () => {
          notifyOnPersistenceFailure(
            tocNotesCollection.update(hint.id, (draft) => {
              draft.isResolved = true;
            }),
            t('common.errors.actionFailed'),
          );
        },
      });
    }

    return actions;
  };

  const visibleCount = isExpanded ? hints.length : COLLAPSED_HINTS;
  const visibleHints: ResultCardHint[] = hints
    .slice(0, visibleCount)
    .map((hint) => ({
      id: hint.id,
      label: hint.name,
      status: hint.status,
      statusLabelKey:
        hint.status === 'open'
          ? undefined
          : `redesign.tableOfContentsCard.statusBadge.${hint.status}`,
      menuAriaLabelKey: 'redesign.tableOfContentsCard.menu.ariaLabel',
      menuAriaLabelOptions: {
        name: hint.name,
      },
      actions: buildActions(hint),
    }));

  const hiddenCount = Math.max(hints.length - COLLAPSED_HINTS, 0);
  return (
    <ResultCard
      processed={processedCount}
      total={totalItems}
      statusTextKey="redesign.tableOfContentsCard.status.progress"
      statusTextOptions={{
        processed: processedCount,
        total: totalItems,
      }}
      titleKey="redesign.tableOfContentsCard.title"
      infoTooltipKey="redesign.tableOfContentsCard.info"
      infoTooltipAriaLabelKey="redesign.tableOfContentsCard.infoLabel"
      descriptionKey="redesign.tableOfContentsCard.description"
      hintsHeadingKey="redesign.tableOfContentsCard.hintsHeading"
      hintsHeadingOptions={{
        count: openCount,
      }}
      hints={visibleHints}
      hintsListClassName={isExpanded ? EXPANDED_LIST_CLASS : undefined}
      footerStart={
        hiddenCount > 0 ? (
          <ResultCardShowMoreButton
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
          >
            {isExpanded
              ? t('redesign.common.showLess')
              : t('redesign.common.showMore', { count: hiddenCount })}
          </ResultCardShowMoreButton>
        ) : null
      }
      footerEnd={
        canMutateProject && openCount > 0 ? (
          <ResultCardRequestAllButton
            onClick={() => {
              navigate({
                to: '/verfahren/$verfahrenId/fvp/documents',
                params: { verfahrenId: projectId },
                search: (prev) => ({
                  ...prev,
                  sidebarPanel: 'requestList' as const,
                  newRequestListInitItems: hints
                    .filter((hint) => hint.status === 'open')
                    .map((hint) => ({
                      title: hint.name,
                      sourceRef: {
                        type: 'tableOfContents' as const,
                        itemId: hint.id,
                      },
                    })),
                }),
                replace: true,
                resetScroll: false,
              });
            }}
          >
            {t('redesign.common.requestAll')}
          </ResultCardRequestAllButton>
        ) : null
      }
    />
  );
};
