import { usePdfPopout } from '@/features/project/pdf-popout/PdfPopoutWorkspaceContext';
import { FeedbackLookupProvider } from '@/features/feedback/FeedbackLookupProvider';
import { NodeFeedbackThumbButtons } from '@/features/feedback/NodeFeedbackThumbButtons';
import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { AiReferenceAggregateCard } from '@/features/ui/ai-reference-aggregate-card/AiReferenceAggregateCard';
import type { AiReferenceAggregateCardRow } from '@/features/ui/ai-reference-aggregate-card/AiReferenceAggregateCard';
import { getRouteApi } from '@tanstack/react-router';
import { File, Info } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FundstellenDocumentGroupCardModel } from './mvpFundstellenCardModels';

const MAX_VISIBLE_FUNDSTELLEN = 6;
const SHOW_MORE_BUTTON_CLASSES =
  'focus-ring rounded-[4px] text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-700 transition-colors hover:text-slate-900';
const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

type FundstellenDocumentGroupCardProps = {
  documentFileId?: string | null;
  documentLabel?: string | null;
  fundstellenDocumentGroupCard: FundstellenDocumentGroupCardModel;
  isExternal?: boolean;
  onShowVersions?: () => void;
  selectedFundstelleId?: string | null;
};

/**
 * Resolves a document-grouped Fundstellen card into PDF page jumps while
 * keeping selected-row highlighting and feedback targets bound to visible rows.
 */
export const FundstellenDocumentGroupCard = (
  props: FundstellenDocumentGroupCardProps,
) => {
  const { documentFileId, documentLabel, fundstellenDocumentGroupCard } = props;
  const { t } = useTranslation('MvpRedesign');
  const navigate = route.useNavigate();
  const { openConnectedFile, jumpToConnectedFilePage } = usePdfPopout();
  // eslint-disable-next-line no-restricted-syntax -- expanded/collapsed state is local presentation-only UI state for this card.
  const [isExpanded, setIsExpanded] = useState(false);
  const hasToggle =
    fundstellenDocumentGroupCard.entries.length > MAX_VISIBLE_FUNDSTELLEN;
  const hiddenFundstellenCount =
    fundstellenDocumentGroupCard.entries.length - MAX_VISIBLE_FUNDSTELLEN;
  const visibleFundstellen = isExpanded
    ? fundstellenDocumentGroupCard.entries
    : fundstellenDocumentGroupCard.entries.slice(0, MAX_VISIBLE_FUNDSTELLEN);
  const feedbackTargetRefs = visibleFundstellen.map((fundstelle) => ({
    id: fundstelle.id,
    node_type: 'fundstelle' as const,
  }));
  const resolvedDocumentLabel =
    documentLabel ?? t('FundstellenTabContent.keinDokument');
  const resolvedDocumentFileId = documentFileId ?? null;
  const hasOutdatedFundstellen =
    fundstellenDocumentGroupCard.hasOutdatedFundstellen === true;
  const fundstellenListId = `fundstellen-document-group-list-${fundstellenDocumentGroupCard.documentId}`;
  const rows = visibleFundstellen.map((fundstelle) => {
    const title =
      fundstelle.title || t('FundstellenTabContent.missingTitlePlaceholder');
    const onClick = resolvedDocumentFileId
      ? () => {
          navigate({
            search: (prev) => ({
              ...prev,
              previewDocumentId: fundstellenDocumentGroupCard.documentId,
            }),
            replace: true,
            resetScroll: false,
          });
          openConnectedFile(resolvedDocumentFileId);
          jumpToConnectedFilePage(
            fundstelle.pageNumber,
            resolvedDocumentFileId,
          );
        }
      : undefined;

    return {
      ariaLabel: t('FundstellenDocumentGroupCard.fundstelleAriaLabel', {
        title,
        page: fundstelle.pageNumber,
      }),
      id: fundstelle.id,
      isSelected: props.selectedFundstelleId === fundstelle.id,
      meta: t('FundstellenDocumentGroupCard.pageNumber', {
        page: fundstelle.pageNumber,
      }),
      onClick,
      title,
      trailing: (
        <NodeFeedbackThumbButtons
          targetRef={{ id: fundstelle.id, node_type: 'fundstelle' }}
        />
      ),
    } satisfies AiReferenceAggregateCardRow;
  });
  const headerAccessory = props.isExternal ? (
    <TooltipWrapper
      content={t('FundstellenDocumentGroupCard.externalTooltip')}
      className="max-w-60"
      side="top"
      align="end"
    >
      <button
        type="button"
        aria-label={t('FundstellenTabContent.externalDocumentAriaLabel')}
        className="focus-ring inline-flex shrink-0 items-center justify-center rounded-full text-slate-700"
      >
        <Info className="size-3.5" aria-hidden="true" />
      </button>
    </TooltipWrapper>
  ) : null;
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
        ? t('FundstellenDocumentGroupCard.showLess')
        : t('FundstellenDocumentGroupCard.showMore', {
            count: hiddenFundstellenCount,
          })}
    </button>
  ) : null;
  const outdatedTooltip = hasOutdatedFundstellen
    ? {
        closeLabel: t('FundstellenDocumentGroupCard.outdatedTooltipClose'),
        description: t(
          'FundstellenDocumentGroupCard.outdatedTooltipDescription',
        ),
        title: t('FundstellenDocumentGroupCard.outdatedTooltipTitle'),
        versionAction: props.onShowVersions
          ? {
              label: t('FundstellenDocumentGroupCard.showVersions'),
              onClick: props.onShowVersions,
            }
          : undefined,
      }
    : undefined;

  return (
    <FeedbackLookupProvider targetRefs={feedbackTargetRefs}>
      <AiReferenceAggregateCard
        headerAccessory={headerAccessory}
        isOutdated={hasOutdatedFundstellen}
        outdatedLabel={t('FundstellenDocumentGroupCard.outdated')}
        outdatedTooltip={outdatedTooltip}
        rows={rows}
        rowsId={fundstellenListId}
        showMoreControl={showMoreControl}
        title={
          <span className="flex min-w-0 items-center gap-2 truncate">
            <File className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{resolvedDocumentLabel}</span>
          </span>
        }
      />
    </FeedbackLookupProvider>
  );
};
