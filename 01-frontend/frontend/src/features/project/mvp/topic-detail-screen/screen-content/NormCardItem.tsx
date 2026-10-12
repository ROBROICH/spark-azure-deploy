import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import type { NodePayloadByType } from '@/db/nodes/types';
import {
  commentSidebarSearchUpdate,
  requestSidebarSearchUpdate,
} from '@/features/project/action-sidebar/sidebarSearchParams';
import {
  WORKFLOW_TYPE_BEWERTUNG,
  WORKFLOW_TYPE_SUZ_NORM,
  useRunningWorkflow,
} from '@/features/workflow-runtime/workflow-status/useRunningWorkflow';
import { ProcessingFailureBadge } from '@/features/project/processing-failure/ProcessingFailureBadge';
import { hasOutdatedNodeSummary } from '@/features/project/versioning/outdatedSummary';
import type { LawChangeRecord } from '@/features/project/law-changes/data/lawChanges.types';
import type { WorkflowFailureCode } from '@/features/workflow-runtime/workflow-status/workflowStatus.types';
import { AiNormCard } from '@/features/ui/cards/ai-norm-card/AiNormCard';
import { getRouteApi } from '@tanstack/react-router';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getTopicNormParagraphRef,
  getTopicNormTitle,
  type TopicNormEntry,
} from '../screen-data/useRechtsgrundlageData.helpers';
import { useSelectedDocumentLabel } from './MvpSelectionLabelsContext';
import { NormCardLawChangeIndicator } from './NormCardLawChangeIndicator';
import { NormCardManualBadge } from './NormCardManualBadge';
import { getNormCardVariant } from './normCardVariant';
import { NormCardItemMenu } from './NormCardItemMenu';
import { NormCardItemSkeleton } from './NormCardItemSkeleton';
import { useFundstellenBadgePresence } from './useFundstellenBadgePresence';
import { useStartNormAiAnalysis } from './useStartNormAiAnalysis';
import {
  getNormCardAiStatus,
  getNormCardAiWorkflowState,
  getNormCardReviewStatus,
  getNormCardTitle,
} from './normCardStatus';

type NormCardItemProps = {
  aiAnalysisFailureCode: WorkflowFailureCode | null;
  canMutateTopic: boolean;
  lawChanges: LawChangeRecord[];
  normIdsWithFundstellen: ReadonlySet<string>;
  removingNormId: string | null;
  norm: TopicNormEntry;
  onRemove: (norm: TopicNormEntry) => void;
  onSelectNorm: (normId: string) => void;
  onToggleReviewed: (topicNorm: NodePayloadByType<'topic_norm'>) => void;
  selectedNormId?: string;
};

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

/**
 * Keeps norm selection, review status, AI workflow state, and route actions on
 * one card so optimistic review updates only rerender the affected card path.
 */
const NormCardItemComponent = (props: NormCardItemProps) => {
  const { topicName, verfahrenId } = route.useParams();
  const navigate = route.useNavigate();

  const {
    aiAnalysisFailureCode,
    normIdsWithFundstellen,
    removingNormId,
    norm,
    lawChanges,
    onRemove,
    onSelectNorm,
    onToggleReviewed,
    selectedNormId,
    canMutateTopic,
  } = props;
  const selectedDocumentLabel = useSelectedDocumentLabel();
  const { t } = useTranslation('MvpRedesign');
  const mvpReviewStatus = norm.topicNorm.mvpStatus;
  const normId = norm.norm?.id ?? '';
  const canStartAiAnalysis = normId.length > 0;
  const filterNormId = normId || norm.topicNorm.id;
  const sourceItemId = normId || norm.topicNorm.id;
  const sidebarItemTitle =
    `${getTopicNormParagraphRef(norm)} ${norm.topicNorm.jurabk}`.trim() ||
    sourceItemId;
  const normRef = norm.norm
    ? { id: norm.norm.id, nodeType: 'norm' as const }
    : null;
  const atomareTbmRefs = useDescendants('atomares_tbm', normRef);
  const fundstelleRefs = useDescendants('fundstelle', normRef);
  const hasFundstelleDescendant = norm.norm
    ? normIdsWithFundstellen.has(norm.norm.id)
    : null;
  const hasFilteredFundstelleBadge = useFundstellenBadgePresence({
    normId: filterNormId,
  });
  const isRemoving =
    norm.norm?.id === removingNormId || norm.topicNorm.id === removingNormId;
  const hasAtomareTbmDescendant = atomareTbmRefs.length > 0;
  const hasOutdatedFundstelleDescendant =
    hasOutdatedNodeSummary(fundstelleRefs);
  const {
    isRunning,
    isLoading: isSuzWorkflowLoading,
    isError: isSuzWorkflowError,
    observeStarted: observeSuzWorkflowStarted,
  } = useRunningWorkflow({
    workflowType: WORKFLOW_TYPE_SUZ_NORM,
    matchIdsInWorkflowId: canStartAiAnalysis ? [verfahrenId, normId] : [],
  });
  const {
    isRunning: isBewertungWorkflowRunning,
    isLoading: isBewertungWorkflowLoading,
    isError: isBewertungWorkflowError,
  } = useRunningWorkflow({
    workflowType: WORKFLOW_TYPE_BEWERTUNG,
    matchIdsInWorkflowId: canStartAiAnalysis ? [verfahrenId, normId] : [],
  });
  const {
    isPending: isStartSuzNormWorkflowPending,
    startAiAnalysis: handleStartAiAnalysis,
  } = useStartNormAiAnalysis({
    canMutateTopic,
    canStartAiAnalysis,
    hasAtomareTbmDescendant,
    normId,
    observeSuzWorkflowStarted,
    verfahrenId,
  });

  const {
    isStartAiAnalysisDisabled,
    isStartAiAnalysisLoading,
    lacksAtomareTbmDescendant,
  } = getNormCardAiWorkflowState({
    canMutateTopic,
    hasAtomareTbmDescendant,
    isBewertungWorkflowError,
    isBewertungWorkflowLoading,
    isBewertungWorkflowRunning,
    isMutationPending: isStartSuzNormWorkflowPending,
    isRunning,
    isSuzWorkflowError,
    isSuzWorkflowLoading,
  });
  const isSelected = selectedNormId === filterNormId;
  const isManualTopicNorm = norm.topicNorm.updateType === 'manual';
  const hasActiveSelectionContext =
    isSelected || Boolean(selectedDocumentLabel);
  const hasMatchHighlight =
    hasFilteredFundstelleBadge && hasActiveSelectionContext;
  const shouldShowUpdateAiAnalysis =
    hasFundstelleDescendant === true && hasOutdatedFundstelleDescendant;
  const aiStatus = getNormCardAiStatus({
    hasFundstelleDescendant,
    isStartAiAnalysisLoading,
    shouldShowUpdateAiAnalysis,
  });
  const aiHeaderActionLabel =
    aiStatus === 'loading'
      ? t('NormCardItem.startAiAnalysisLoading')
      : shouldShowUpdateAiAnalysis
        ? t('NormCardItem.updateAiAnalysis')
        : t('NormCardItem.startAiAnalysis');
  const cardVariant = shouldShowUpdateAiAnalysis
    ? 'default'
    : getNormCardVariant({
        hasMatchHighlight,
        reviewStatus: mvpReviewStatus,
      });
  const reviewStatus = getNormCardReviewStatus(mvpReviewStatus);
  const aiHeaderActionTooltip =
    aiStatus !== 'current'
      ? undefined
      : selectedDocumentLabel && hasFilteredFundstelleBadge
        ? t('NormCardItem.aiSupportDescriptionForDocument', {
            document: selectedDocumentLabel,
          })
        : t('NormCardItem.aiSupportDescription');
  const startAiAnalysisDisabledTooltip = lacksAtomareTbmDescendant
    ? t('NormCardItem.startAiAnalysisMissingTbmTooltip')
    : undefined;
  const normSelectionAriaLabel = t('NormCardItem.normSelectionAriaLabel', {
    paragraphRef: getTopicNormParagraphRef(norm),
    title: getTopicNormTitle(norm),
  });

  const handleRequestMore = () => {
    if (!canMutateTopic) {
      return;
    }

    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        ...requestSidebarSearchUpdate({
          title: sidebarItemTitle,
          topicId: topicName,
          sourceRef: {
            type: 'materialNorm',
            itemId: sourceItemId,
          },
        }),
      }),
      replace: true,
      resetScroll: false,
    });
  };
  const handleAddComment = () => {
    if (!canMutateTopic) {
      return;
    }

    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        ...commentSidebarSearchUpdate({
          title: sidebarItemTitle,
          processStep: 'materialCompletenessCheck',
          sourceRef: {
            type: 'materialNorm',
            itemId: sourceItemId,
          },
        }),
      }),
      replace: true,
      resetScroll: false,
    });
  };
  const handleShowNormText = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        detailDocumentId: norm.topicNorm.id,
      }),
      resetScroll: false,
    });
  };
  const handleSelectNorm = () => {
    onSelectNorm(filterNormId);
  };

  if (norm.norm === null) {
    return <NormCardItemSkeleton withStatus />;
  }

  const normCardTitle = getNormCardTitle(norm.norm);
  // A new run supersedes the failure of the previous one.
  const shownAiAnalysisFailureCode = isRunning ? null : aiAnalysisFailureCode;

  return (
    <AiNormCard
      title={normCardTitle}
      notice={
        shownAiAnalysisFailureCode ? (
          <ProcessingFailureBadge
            area="mvpNorm"
            errorCode={shownAiAnalysisFailureCode}
            subject={normCardTitle}
          />
        ) : null
      }
      variant={cardVariant}
      selection={{
        ariaLabel: normSelectionAriaLabel,
        isSelected,
        onSelect: handleSelectNorm,
      }}
      aiAction={{
        ariaLabel: t('NormCardItem.aiSupportLabel'),
        label: aiHeaderActionLabel,
        status: !canStartAiAnalysis ? 'none' : aiStatus,
        tooltip: aiHeaderActionTooltip,
        isDisabled: isStartAiAnalysisDisabled,
        disabledTooltip: startAiAnalysisDisabledTooltip,
        onClick: aiStatus === 'current' ? undefined : handleStartAiAnalysis,
      }}
      headerIcons={
        <>
          {isManualTopicNorm && <NormCardManualBadge />}
          <NormCardLawChangeIndicator
            lawChanges={lawChanges}
            topicNorm={norm.topicNorm}
          />
        </>
      }
      reviewAction={{
        checkedLabel: t('NormCardItem.geprueft'),
        disabled: !canMutateTopic,
        recheckLabel: t('NormCardItem.erneutPruefen'),
        status: reviewStatus,
        uncheckedLabel: t('NormCardItem.pruefen'),
        onClick: () => onToggleReviewed(norm.topicNorm),
      }}
      menu={
        <NormCardItemMenu
          canMutateTopic={canMutateTopic}
          isRemoving={isRemoving}
          onRequestMore={handleRequestMore}
          onAddComment={handleAddComment}
          onShowNormText={handleShowNormText}
          onRemove={() => onRemove(norm)}
        />
      }
    />
  );
};

export const NormCardItem = memo(NormCardItemComponent);
NormCardItem.displayName = 'NormCardItem';
