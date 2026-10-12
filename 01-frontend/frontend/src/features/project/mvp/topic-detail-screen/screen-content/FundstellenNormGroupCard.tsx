import { usePdfPopout } from '@/features/project/pdf-popout/PdfPopoutWorkspaceContext';
import { FeedbackLookupProvider } from '@/features/feedback/FeedbackLookupProvider';
import { NodeFeedbackThumbButtons } from '@/features/feedback/NodeFeedbackThumbButtons';
import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { AiReferenceAggregateCard } from '@/features/ui/ai-reference-aggregate-card/AiReferenceAggregateCard';
import type { AiReferenceAggregateCardRow } from '@/features/ui/ai-reference-aggregate-card/AiReferenceAggregateCard';
import { getRouteApi } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { useState } from 'react';
import type { MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { FundstellenFocusCount } from './FundstellenFocusCount';
import { FundstellenNotInFocusHint } from './FundstellenNotInFocusHint';
import { doesFundstelleCarryAssessment } from './fundstellenReliability';
import type { FundstellenNormGroupCardModel } from './mvpFundstellenCardModels';

const MAX_VISIBLE_FUNDSTELLEN = 6;
const SHOW_MORE_BUTTON_CLASSES =
  'focus-ring rounded-[4px] text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-700 transition-colors hover:text-slate-900';
const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

type FundstellenNormGroupCardProps = {
  documentId?: string | null;
  documentFileId?: string | null;
  fundstellenNormGroupCard: FundstellenNormGroupCardModel;
  normLabel?: string | null;
  isExternal?: boolean;
  isRefreshDisabled?: boolean;
  isRefreshRunning?: boolean;
  onShowVersions?: () => void;
  onRefresh?: () => void;
  selectedFundstelleId?: string | null;
};

/**
 * Resolves a norm-grouped Fundstellen card into document-preserving PDF jumps
 * and exposes refresh/version actions only for outdated internal references.
 */
export const FundstellenNormGroupCard = (
  props: FundstellenNormGroupCardProps,
) => {
  const { documentFileId, documentId, fundstellenNormGroupCard } = props;
  const { t } = useTranslation('MvpRedesign');
  const navigate = route.useNavigate();
  const { openConnectedFile, jumpToConnectedFilePage } = usePdfPopout();
  // eslint-disable-next-line no-restricted-syntax -- expanded/collapsed state is local presentation-only UI state for this card.
  const [isExpanded, setIsExpanded] = useState(false);
  const hasToggle =
    fundstellenNormGroupCard.entries.length > MAX_VISIBLE_FUNDSTELLEN;
  const hiddenFundstellenCount =
    fundstellenNormGroupCard.entries.length - MAX_VISIBLE_FUNDSTELLEN;
  const visibleFundstellen = isExpanded
    ? fundstellenNormGroupCard.entries
    : fundstellenNormGroupCard.entries.slice(0, MAX_VISIBLE_FUNDSTELLEN);
  const feedbackTargetRefs = visibleFundstellen.map((fundstelle) => ({
    id: fundstelle.id,
    nodeType: 'fundstelle' as const,
  }));
  const headerLabel = props.normLabel ?? fundstellenNormGroupCard.normId;
  const hasOutdatedFundstellen =
    fundstellenNormGroupCard.hasOutdatedFundstellen === true;
  const fundstellenListId = `fundstellen-norm-group-list-${fundstellenNormGroupCard.normId}`;
  const rows = visibleFundstellen.map((fundstelle) => {
    const title =
      fundstelle.title || t('FundstellenTabContent.missingTitlePlaceholder');
    const onClick = documentFileId
      ? (event: MouseEvent<HTMLElement>) => {
          event.preventDefault();

          if (documentId) {
            navigate({
              search: (prev) => ({
                ...prev,
                previewDocumentId: documentId,
              }),
              replace: true,
              resetScroll: false,
            });
          }

          openConnectedFile(documentFileId);
          jumpToConnectedFilePage(fundstelle.pageNumber, documentFileId);
        }
      : undefined;

    return {
      ariaLabel: t('FundstellenNormGroupCard.fundstelleAriaLabel', {
        title,
        page: fundstelle.pageNumber,
      }),
      href: documentFileId ? `#fundstelle-${fundstelle.id}` : undefined,
      id: fundstelle.id,
      afterTitle: (
        <FundstellenNotInFocusHint confidence={fundstelle.confidence} />
      ),
      isSelected: props.selectedFundstelleId === fundstelle.id,
      meta: t('FundstellenNormGroupCard.pageNumber', {
        page: fundstelle.pageNumber,
      }),
      onClick,
      title: doesFundstelleCarryAssessment(fundstelle.confidence) ? (
        title
      ) : (
        <span className="text-slate-500">{title}</span>
      ),
      trailing: (
        <NodeFeedbackThumbButtons
          targetRef={{ id: fundstelle.id, nodeType: 'fundstelle' }}
        />
      ),
    } satisfies AiReferenceAggregateCardRow;
  });
  const headerAccessory = props.isExternal ? (
    <TooltipWrapper
      content={t('FundstellenNormGroupCard.externalTooltip')}
      className="max-w-60"
      side="top"
      align="end"
    >
      <button
        type="button"
        aria-label={t('FundstellenTabContent.externalNormAriaLabel')}
        className="focus-ring inline-flex shrink-0 items-center justify-center rounded-full text-slate-700"
      >
        <Info className="size-3.5" aria-hidden="true" />
      </button>
    </TooltipWrapper>
  ) : null;
  const focusCount = (
    <FundstellenFocusCount entries={fundstellenNormGroupCard.entries} />
  );
  const showMoreControl = hasToggle ? (
    <button
      type="button"
      className={SHOW_MORE_BUTTON_CLASSES}
      aria-controls={fundstellenListId}
      aria-expanded={isExpanded}
      onClick={() => {
        setIsExpanded((prev) => !prev);
      }}
    >
      {isExpanded
        ? t('FundstellenNormGroupCard.showLess')
        : t('FundstellenNormGroupCard.showMore', {
            count: hiddenFundstellenCount,
          })}
    </button>
  ) : null;
  const refreshAction =
    hasOutdatedFundstellen && props.onRefresh
      ? {
          disabled: props.isRefreshDisabled,
          isLoading: props.isRefreshRunning,
          label: t('FundstellenNormGroupCard.refresh'),
          onClick: props.onRefresh,
        }
      : undefined;
  const outdatedTooltip = hasOutdatedFundstellen
    ? {
        closeLabel: t('FundstellenNormGroupCard.outdatedTooltipClose'),
        description: t('FundstellenNormGroupCard.outdatedTooltipDescription'),
        instruction: props.onRefresh
          ? t('FundstellenNormGroupCard.outdatedTooltipInstruction')
          : undefined,
        refreshAction: refreshAction
          ? {
              disabled: refreshAction.disabled || refreshAction.isLoading,
              isLoading: refreshAction.isLoading,
              label: t('FundstellenNormGroupCard.refresh'),
              onClick: refreshAction.onClick,
            }
          : undefined,
        title: t('FundstellenNormGroupCard.outdatedTooltipTitle'),
        versionAction: props.onShowVersions
          ? {
              label: t('FundstellenNormGroupCard.showVersions'),
              onClick: props.onShowVersions,
            }
          : undefined,
      }
    : undefined;

  return (
    <FeedbackLookupProvider targetRefs={feedbackTargetRefs}>
      <AiReferenceAggregateCard
        action={refreshAction}
        headerAccessory={
          <>
            {focusCount}
            {headerAccessory}
          </>
        }
        isOutdated={hasOutdatedFundstellen}
        outdatedLabel={t('FundstellenNormGroupCard.outdated')}
        outdatedTooltip={outdatedTooltip}
        rows={rows}
        rowsId={fundstellenListId}
        showMoreControl={showMoreControl}
        title={headerLabel}
      />
    </FeedbackLookupProvider>
  );
};
