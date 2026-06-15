import {
  resolveRequiredDocument,
  unresolveRequiredDocument,
} from '@/features/project/fvp/main-screen/data/actions/requiredDocumentResolveActions';
import { CollectionErrorAlert } from '@/features/project/fvp/main-screen/read-status/CollectionErrorAlert';
import { notifyOnPersistenceFailure } from '@/features/project/fvp/main-screen/read-status/notifyOnPersistenceFailure';
import { retryRequiredDocumentsReads } from '@/features/project/fvp/data/fvpResultReads';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { requestSidebarSearchUpdate } from '@/features/project/action-sidebar/sidebarSearchParams';
import { getRouteApi } from '@tanstack/react-router';
import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ResultCard,
  type ResultCardHint,
  type ResultCardHintAction,
} from './ResultCard';
import { ResultCardSkeleton } from './ResultCardSkeleton';
import {
  ResultCardRequestAllButton,
  ResultCardShowMoreButton,
  resultCardIconActionClass,
} from './resultCardActions';
import {
  useRequiredDocumentHints,
  type RequiredDocumentHint,
} from './useRequiredDocumentHints';

const COLLAPSED_HINTS = 3;
const EXPANDED_LIST_CLASS = 'max-h-[592px] overflow-y-auto';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/documents/');

type RequiredDocumentsResultCardProps = {
  projectId: string;
};

type VisibleRequiredDocumentHint = RequiredDocumentHint & {
  status: Exclude<RequiredDocumentHint['status'], 'available'>;
};

const isVisibleRequiredDocumentHint = (
  hint: RequiredDocumentHint,
): hint is VisibleRequiredDocumentHint => hint.status !== 'available';

/** Renders the required-documents result card with hint actions and the edit dialog entry point. */
export const RequiredDocumentsResultCard = (
  props: RequiredDocumentsResultCardProps,
) => {
  const { projectId } = props;
  const { t } = useTranslation('FormalCompletenessCheck');
  const navigate = route.useNavigate();
  const { canMutateProject } = useCanMutateProject({
    requiredLevel: 'user',
  });
  // eslint-disable-next-line no-restricted-syntax -- expand toggle is local card UI state
  const [isExpanded, setIsExpanded] = useState(false);
  const {
    hints,
    totalRequired,
    processedCount,
    openCount,
    isLoading,
    isError,
  } = useRequiredDocumentHints(projectId);

  if (isLoading) {
    return <ResultCardSkeleton />;
  }

  if (isError) {
    return (
      <CollectionErrorAlert
        onRetry={() => retryRequiredDocumentsReads(projectId)}
      />
    );
  }

  /** Builds menu actions for one required-document hint based on its current review status. */
  const buildActions = (hint: RequiredDocumentHint): ResultCardHintAction[] => {
    if (!canMutateProject) {
      return [];
    }

    const actions: ResultCardHintAction[] = [];

    if (hint.status === 'requested') {
      actions.push({
        id: 'open-requests',
        labelKey: 'redesign.requiredDocumentsCard.menu.openRequests',
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
        labelKey: 'redesign.requiredDocumentsCard.menu.request',
        // eslint-disable-next-line custom-jsdoc/require-jsdoc-complexity -- the callback assembles route search state for one menu command.
        onSelect: () => {
          navigate({
            to: '/verfahren/$verfahrenId/fvp/documents',
            params: { verfahrenId: projectId },
            search: (prev) => ({
              ...prev,
              ...requestSidebarSearchUpdate({
                title: hint.name,
                sourceRef: { type: 'requiredDocuments', itemId: hint.id },
              }),
            }),
            replace: true,
            resetScroll: false,
          });
        },
      });
    }

    if (hint.status === 'irrelevant') {
      actions.push({
        id: 'unresolve',
        labelKey: 'redesign.requiredDocumentsCard.menu.markRelevant',
        onSelect: () =>
          notifyOnPersistenceFailure(
            unresolveRequiredDocument(projectId, hint.id),
            t('common.errors.actionFailed'),
          ),
      });
    } else {
      actions.push({
        id: 'resolve',
        labelKey: 'redesign.requiredDocumentsCard.menu.markIrrelevant',
        onSelect: () =>
          notifyOnPersistenceFailure(
            resolveRequiredDocument(projectId, hint.id),
            t('common.errors.actionFailed'),
          ),
      });
    }

    return actions;
  };

  const missingHints = hints.filter(isVisibleRequiredDocumentHint);
  const visibleCount = isExpanded ? missingHints.length : COLLAPSED_HINTS;
  const visibleHints: ResultCardHint[] = missingHints
    .slice(0, visibleCount)
    .map((hint) => ({
      id: hint.id,
      label: hint.name,
      status: hint.status,
      statusLabelKey:
        hint.status === 'open'
          ? undefined
          : `redesign.requiredDocumentsCard.statusBadge.${hint.status}`,
      menuAriaLabelKey: 'redesign.requiredDocumentsCard.menu.ariaLabel',
      menuAriaLabelOptions: {
        name: hint.name,
      },
      actions: buildActions(hint),
    }));

  const hiddenCount = Math.max(missingHints.length - COLLAPSED_HINTS, 0);

  return (
    <ResultCard
      processed={processedCount}
      total={totalRequired}
      statusTextKey="redesign.requiredDocumentsCard.status.progress"
      statusTextOptions={{
        processed: processedCount,
        total: totalRequired,
      }}
      titleKey="redesign.requiredDocumentsCard.title"
      infoTooltipKey="redesign.requiredDocumentsCard.info"
      infoTooltipAriaLabelKey="redesign.requiredDocumentsCard.infoLabel"
      titleAction={
        canMutateProject ? (
          <button
            type="button"
            aria-label={t('redesign.requiredDocumentsCard.editAriaLabel')}
            className={resultCardIconActionClass}
            onClick={() => {
              navigate({
                to: '/verfahren/$verfahrenId/fvp/documents',
                params: { verfahrenId: projectId },
                search: (previous) => ({
                  ...previous,
                  isEditRequiredDocumentsDialogOpen: true,
                }),
                replace: true,
                resetScroll: false,
              });
            }}
          >
            <Pencil aria-hidden="true" className="size-4" />
          </button>
        ) : null
      }
      descriptionKey="redesign.requiredDocumentsCard.description"
      hintsHeadingKey="redesign.requiredDocumentsCard.hintsHeading"
      hintsHeadingOptions={{
        count: missingHints.length,
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
                        type: 'requiredDocuments' as const,
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
