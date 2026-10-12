import { ProcessingFailureBadge } from '@/features/project/processing-failure/ProcessingFailureBadge';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useNode } from '@/db/nodes/hooks/useNodes';
import type { NodeRefByType } from '@/db/nodes/types';
import {
  commentSidebarSearchUpdate,
  requestSidebarSearchUpdate,
} from '@/features/project/action-sidebar/sidebarSearchParams';
import { LawChangeIndicator } from '@/features/project/law-changes/ui/LawChangeIndicator';
import { hasOutdatedNodeSummary } from '@/features/project/versioning/outdatedSummary';
import { useProjectVersionsNavigation } from '@/features/project/versioning/useProjectVersionsNavigation';
import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { Button } from '@/features/ui/button/Button';
import { getRouteApi } from '@tanstack/react-router';
import {
  BookOpenText,
  EllipsisVertical,
  FileInput,
  MessageSquare,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AiNormAbsatzSections } from './AiNormAbsatzSections';
import {
  AiBewertungTriggerCard,
  type AiBewertungTriggerState,
} from './AiBewertungTriggerCard';
import { getNormLabel } from './aiNormLabel';
import { getNormRequestTitle } from './aiNormRequestTitle';
import { useKiTopicNormState } from './AiTopicNormContext';
import {
  RPB_BEWERTUNG_WORKFLOW_TYPES,
  type RpbBewertungRefreshDisabledReason,
  useRpbBewertungRefreshAction,
} from '../ai-rating/useRpbBewertungRefreshAction';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

const BEWERTUNG_DISABLED_TOOLTIP_KEY_BY_REASON = {
  missingTbm: 'aiAssistance.startAiAnalysisMissingTbmTooltip',
  noPermission: 'aiAssistance.startAiAnalysisDisabledNoPermissionTooltip',
} as const satisfies Record<RpbBewertungRefreshDisabledReason, string>;

type AiNormDetailContentProps = {
  normRef: NodeRefByType<'norm'>;
};

/**
 * Converts workflow, freshness, and norm-type facts into one trigger-card state.
 */
const resolveKiBewertungTriggerState = (params: {
  disabledTooltip?: string;
  hasCompletedEmptyKiRun: boolean;
  hasKiResults: boolean;
  hasOutdatedKiResults: boolean;
  isProceduralNorm: boolean;
  isRefreshDisabled: boolean;
  isRefreshRunning: boolean;
  onRefresh: () => void;
  onShowVersions: () => void;
}): AiBewertungTriggerState => {
  const {
    disabledTooltip,
    hasCompletedEmptyKiRun,
    hasKiResults,
    hasOutdatedKiResults,
    isProceduralNorm,
    isRefreshDisabled,
    isRefreshRunning,
    onRefresh,
    onShowVersions,
  } = params;

  if (isProceduralNorm) {
    return { type: 'procedural' };
  }

  if (hasCompletedEmptyKiRun) {
    return { type: 'empty-success' };
  }

  if (!hasKiResults) {
    return {
      disabledTooltip,
      isStartDisabled: isRefreshDisabled,
      onStart: onRefresh,
      type: isRefreshRunning ? 'progress' : 'empty',
    };
  }

  if (hasOutdatedKiResults) {
    return {
      disabledTooltip,
      isRefreshDisabled,
      isRefreshRunning,
      onRefresh,
      onShowVersions,
      type: 'outdated',
    };
  }

  return { type: 'success' };
};

/**
 * Renders the selected norm header actions, starts the Bewertung workflow for
 * the current norm, and keeps the AI button in sync with Temporal state.
 */
export const AiNormDetailContent = (props: AiNormDetailContentProps) => {
  const { normRef } = props;
  const { t } = useTranslation('Rpb');
  const { verfahrenId } = route.useParams();
  const topicId = route.useSearch({
    select: (search) => search.topicId,
  });
  const navigate = route.useNavigate();
  const { data: norm } = useNode(normRef);
  const bewertungRefs = useDescendants('bewertung', normRef);
  const hasKiResults = bewertungRefs.length > 0;
  const bewertungQuelleRefs = useDescendants('bewertung_quelle', normRef);
  const hasOutdatedKiResults =
    hasOutdatedNodeSummary(bewertungRefs) ||
    hasOutdatedNodeSummary(bewertungQuelleRefs);
  const { canMutateTopic, topicNorm } = useKiTopicNormState();
  const requestTitle = getNormRequestTitle(
    norm?.paragraphNr,
    topicNorm?.jurabk,
    normRef.id,
  );
  const handleShowVersions = useProjectVersionsNavigation(verfahrenId);
  const refreshAction = useRpbBewertungRefreshAction({
    canMutateTopic,
    normId: normRef.id,
    verfahrenId,
    workflowType: RPB_BEWERTUNG_WORKFLOW_TYPES,
  });
  const hasCompletedEmptyKiRun =
    refreshAction.hasSuccessfulBewertungWorkflowRun &&
    !refreshAction.isRefreshRunning &&
    !hasKiResults;
  const isProceduralNorm = topicNorm?.type === 'verfahren';
  const disabledTooltip = refreshAction.disabledReason
    ? t(BEWERTUNG_DISABLED_TOOLTIP_KEY_BY_REASON[refreshAction.disabledReason])
    : undefined;
  const handleRequestMore = () => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        ...requestSidebarSearchUpdate({
          title: requestTitle,
          topicId,
          sourceRef: {
            type: 'materialNorm',
            itemId: normRef.id,
          },
        }),
      }),
      replace: true,
      resetScroll: false,
    });
  };
  const handleAddComment = () => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        ...commentSidebarSearchUpdate({
          title: requestTitle,
          processStep: 'legalReview',
          sourceRef: {
            type: 'materialNorm',
            itemId: normRef.id,
          },
        }),
      }),
      replace: true,
      resetScroll: false,
    });
  };
  const handleShowLegalText = () => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        showNormtext: true,
      }),
      resetScroll: false,
    });
  };
  const handleOpenLawChange = (lawChangeId: string) => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        lawChangeId,
      }),
      replace: true,
      resetScroll: false,
    });
  };
  const triggerState = resolveKiBewertungTriggerState({
    disabledTooltip,
    hasCompletedEmptyKiRun,
    hasKiResults,
    hasOutdatedKiResults,
    isProceduralNorm,
    isRefreshDisabled: refreshAction.isRefreshDisabled,
    isRefreshRunning: refreshAction.isRefreshRunning,
    onRefresh: refreshAction.onRefresh,
    onShowVersions: handleShowVersions,
  });

  return (
    <>
      <div className="flex flex-row items-center justify-between">
        <p className="text-[16px] leading-[20px] font-medium tracking-[-0.16px] text-brand-950">
          {getNormLabel(norm)}
        </p>
        <div className="flex items-center gap-2">
          {refreshAction.failureCode !== null && (
            <ProcessingFailureBadge
              area="rpbRating"
              errorCode={refreshAction.failureCode}
            />
          )}
          {topicNorm ? (
            <LawChangeIndicator
              jurabk={topicNorm.jurabk}
              paragraphNr={topicNorm.paragraphNr}
              onOpen={(lawChange) => handleOpenLawChange(lawChange.id)}
            />
          ) : null}
          <ActionMenu>
            <ActionMenuTrigger asChild>
              <Button
                iconOnly
                aria-label={t('aiAssistance.moreOptions')}
                variant="ghost"
              >
                <EllipsisVertical
                  className="text-slate-600"
                  aria-hidden="true"
                />
              </Button>
            </ActionMenuTrigger>
            <ActionMenuContent align="end">
              <ActionMenuItem onClick={handleShowLegalText}>
                <BookOpenText aria-hidden="true" />{' '}
                {t('aiAssistance.showLegalText')}
              </ActionMenuItem>
              <ActionMenuItem onClick={handleRequestMore}>
                <FileInput aria-hidden="true" /> {t('aiAssistance.requestMore')}
              </ActionMenuItem>
              <ActionMenuItem onClick={handleAddComment}>
                <MessageSquare aria-hidden="true" />{' '}
                {t('aiAssistance.addComment')}
              </ActionMenuItem>
            </ActionMenuContent>
          </ActionMenu>
        </div>
      </div>
      {refreshAction.isWorkflowStatusLoading && !hasKiResults ? (
        <Skeleton className="h-[136px] rounded-lg" aria-hidden />
      ) : (
        <AiBewertungTriggerCard state={triggerState} />
      )}
      <hr className="border-border-primary" />
      <AiNormAbsatzSections
        normRef={normRef}
        showMissingAssessmentTooltip={hasKiResults}
      />
    </>
  );
};
