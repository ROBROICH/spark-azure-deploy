import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import {
  commentSidebarSearchUpdate,
  requestSidebarSearchUpdate,
} from '@/features/project/action-sidebar/sidebarSearchParams';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useNode } from '@/db/nodes/hooks/useNodes';
import { cn } from '@/features/ui/style/cn';
import { getRouteApi } from '@tanstack/react-router';
import { ChevronRight } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AiSatzAssessmentCard } from '../ai-rating/AiSatzAssessmentCard';
import { AiSatzRowRechtsmethodikLink } from './AiSatzRowRechtsmethodikLink';
import { AiSatzRowActions } from './AiSatzRowActions';
import { useKiTopicNormState } from './AiTopicNormContext';
import { formatSatzTitle } from '../shared/formatSatzTitle';

export { AiSatzRowSkeleton } from './AiSatzRowSkeleton';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

type AiSatzRowProps = {
  absatzRef: NodeRefByType<'absatz'>;
  hasMultipleAbsaetze: boolean;
  hasMultipleSaetze: boolean;
  requestTitlePrefix?: string;
  requestTitleSuffix?: string;
  satz?: NodePayloadByType<'satz'> | null;
  satzRef: NodeRefByType<'satz'>;
  showDivider: boolean;
  showMissingAssessmentTooltip?: boolean;
};

type AiSatzRowContentProps = AiSatzRowProps & {
  satz: NodePayloadByType<'satz'> | null;
};

/**
 * Renders a Satz row with route-owned actions and optional node-owned feedback.
 */
function AiSatzRowContent(props: AiSatzRowContentProps) {
  const {
    absatzRef,
    hasMultipleAbsaetze,
    hasMultipleSaetze,
    requestTitlePrefix,
    requestTitleSuffix,
    satzRef,
    satz,
    showDivider,
    showMissingAssessmentTooltip = false,
  } = props;
  const { t } = useTranslation('Rpb');
  const { topicId, topicNormId } = route.useSearch({
    select: (search) => ({
      topicId: search.topicId,
      topicNormId: search.topicNormId,
    }),
  });
  const { verfahrenId } = route.useParams();
  const navigate = route.useNavigate();
  const { canMutateTopic, getSatzReviewStatus, topicNorm, toggleSatzChecked } =
    useKiTopicNormState();
  const { data: absatz } = useNode(absatzRef);
  const bewertungRefs = useDescendants('bewertung', satzRef);
  const bewertungRef = bewertungRefs[0];
  const hasBewertung = bewertungRefs.length > 0;
  const disabledChevronTooltip =
    showMissingAssessmentTooltip && !hasBewertung
      ? t('aiAssistance.noAiAssessmentNeededTooltip')
      : undefined;
  const satzReviewStatus = getSatzReviewStatus(satzRef.id);
  const isChecked = satzReviewStatus === 'checked';
  const needsRevision = satzReviewStatus === 'needs_revision';
  const title = formatSatzTitle(t, absatz, satz, {
    hasMultipleAbsaetze,
    hasMultipleSaetze,
  });
  const fallbackTitle = [requestTitlePrefix, requestTitleSuffix]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ');
  const visibleTitle = title || fallbackTitle;
  const requestTitle =
    [requestTitlePrefix, title, requestTitleSuffix]
      .filter((part): part is string => Boolean(part?.trim()))
      .join(' ') || satzRef.id;
  const isTriggerDisabled = !hasBewertung && !disabledChevronTooltip;
  const areTopicActionsDisabled =
    topicNorm === null || !canMutateTopic || !topicId;
  const handleTriggerClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (!hasBewertung) {
      event.preventDefault();
    }
  };
  const handleTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!hasBewertung && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
    }
  };
  const handleRequestMore = () => {
    if (areTopicActionsDisabled) {
      return;
    }

    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        ...requestSidebarSearchUpdate({
          title: requestTitle,
          topicId,
          sourceRef: {
            type: 'materialSatz',
            itemId: satzRef.id,
          },
        }),
      }),
      replace: true,
      resetScroll: false,
    });
  };
  const handleAddComment = () => {
    if (areTopicActionsDisabled) {
      return;
    }

    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        ...commentSidebarSearchUpdate({
          title: requestTitle,
          processStep: 'legalReview',
          sourceRef: {
            type: 'materialSatz',
            itemId: satzRef.id,
          },
        }),
      }),
      replace: true,
      resetScroll: false,
    });
  };
  return (
    <AccordionItem value={satzRef.id} className="w-full">
      {showDivider && <hr className="my-2 border-border-primary" />}
      <div className="flex w-full items-center justify-between gap-2 p-1">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <TooltipWrapper
            content={disabledChevronTooltip}
            side="top"
            align="start"
            className="max-w-72 whitespace-normal"
          >
            <AccordionTrigger
              aria-disabled={!hasBewertung ? true : undefined}
              disabled={isTriggerDisabled}
              onClick={handleTriggerClick}
              onKeyDown={handleTriggerKeyDown}
              className={cn(
                'flex min-w-0 items-center gap-0.5 disabled:opacity-100',
                !hasBewertung && 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'size-4 shrink-0 transition-transform duration-200 group-data-[state=open]/accordion-item:rotate-90',
                  hasBewertung ? 'text-content-tertiary' : 'text-slate-300',
                )}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </span>
              <span className="truncate text-[13px] leading-[18px] font-medium tracking-[-0.13px] text-brand-950">
                {visibleTitle}
              </span>
            </AccordionTrigger>
          </TooltipWrapper>
          <AiSatzRowRechtsmethodikLink
            satzId={satzRef.id}
            topicId={topicId}
            topicNormId={topicNormId}
            verfahrenId={verfahrenId}
          />
        </div>
        <AiSatzRowActions
          addCommentLabel={t('aiAssistance.addComment')}
          isChecked={isChecked}
          isDisabled={areTopicActionsDisabled}
          needsRevision={needsRevision}
          moreOptionsLabel={t('aiAssistance.moreOptions')}
          onAddComment={handleAddComment}
          onCheckedChange={() => {
            if (areTopicActionsDisabled) {
              return;
            }

            toggleSatzChecked(satzRef.id);
          }}
          onRequestMore={handleRequestMore}
          requestMoreLabel={t('aiAssistance.requestMore')}
        />
      </div>

      <p className="px-1 pb-1 text-[13px] leading-[18px] font-normal tracking-[-0.13px] text-brand-950">
        {satz?.text ?? ''}
      </p>

      <AccordionContent>
        <div className="flex flex-col gap-2 pt-2 pb-1">
          {hasBewertung && bewertungRef ? (
            <AiSatzAssessmentCard
              bewertungRef={bewertungRef}
              satzRef={satzRef}
              verfahrenId={verfahrenId}
            />
          ) : null}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function AiSatzRowWithNodeData(props: AiSatzRowProps) {
  const { data: satz } = useNode(props.satzRef);

  return <AiSatzRowContent {...props} satz={satz} />;
}

export function AiSatzRow(props: AiSatzRowProps) {
  if (props.satz !== undefined) {
    return <AiSatzRowContent {...props} satz={props.satz} />;
  }

  return <AiSatzRowWithNodeData {...props} />;
}
