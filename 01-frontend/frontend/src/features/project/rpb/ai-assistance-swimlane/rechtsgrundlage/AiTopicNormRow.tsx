import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import {
  countCheckedSatzStatuses,
  type SatzRevisionStatuses,
} from '@/features/project/versioning/revisionStatus';
import { LawChangeIndicator } from '@/features/project/law-changes/ui/LawChangeIndicator';
import { AiSparklesChip } from '@/features/ui/ai/AiSparklesChip';
import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useLiveNode } from '@/db/nodes/hooks/useLiveNodes';
import { useNode } from '@/db/nodes/hooks/useNodes';
import { getRouteApi, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { RpbOverviewItemRow } from '../shared/ItemRow';
import { StatusBadge } from '../shared/StatusBadge';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

type AiTopicNormRowProps = {
  topicNormRef: NodeRefByType<'topic_norm'>;
};

type TopicNormSatzProgress = {
  checkedCount: number;
  totalCount: number;
  allChecked: boolean;
};

const getParagraphRef = (paragraphNr: string | null) => {
  if (!paragraphNr) {
    return '§';
  }

  return paragraphNr.startsWith('§') ? paragraphNr : `§ ${paragraphNr}`;
};

const getTopicNormLabel = (
  topicNorm: NodePayloadByType<'topic_norm'> | null,
  linkedNorm: NodePayloadByType<'norm'> | null | undefined,
) => {
  if (topicNorm === null) {
    return '';
  }

  const paragraphRef = getParagraphRef(topicNorm.paragraph_nr);
  const paragraphTitle = linkedNorm?.paragraph_titel ?? '';

  if (!paragraphTitle) {
    return paragraphRef;
  }

  return `${paragraphRef} ${paragraphTitle}`;
};

const getTopicNormSatzProgress = (
  satzStatuses: SatzRevisionStatuses,
  satzRefs: NodeRefByType<'satz'>[],
): TopicNormSatzProgress => {
  const satzIds = Array.from(new Set(satzRefs.map((satzRef) => satzRef.id)));
  const checkedCount = countCheckedSatzStatuses(satzStatuses, satzIds);
  const totalCount = satzIds.length;

  return {
    checkedCount,
    totalCount,
    allChecked: totalCount > 0 && checkedCount === totalCount,
  };
};

/**
 * Renders one topic-norm row in the overview, including sentence-review
 * progress, the AI availability indicator derived from descendant nodes,
 * and the optional law-change trigger when a matching amendment exists.
 */
export const AiTopicNormRow = (props: AiTopicNormRowProps) => {
  const { topicNormRef } = props;
  const { t } = useTranslation('Rpb');
  const navigate = route.useNavigate();
  const { verfahrenId } = route.useParams();
  const { data: topicNorm } = useNode(topicNormRef);
  const normRefs = useDescendants('norm', topicNormRef);
  const satzRefs = useDescendants('satz', topicNormRef);
  const bewertungRefs = useDescendants('bewertung', topicNormRef);
  const linkedNormRef = normRefs[0];
  const { data: linkedNorm } = useLiveNode(linkedNormRef);
  const hasBewertung = bewertungRefs.length > 0;
  const label = getTopicNormLabel(topicNorm, linkedNorm);
  const satzProgress = getTopicNormSatzProgress(
    topicNorm?.satz_statuses ?? {},
    satzRefs,
  );

  return (
    <div className="relative">
      <RpbOverviewItemRow showChevron>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <span className="pointer-events-auto relative z-10 inline-flex shrink-0 items-center">
          {topicNorm ? (
            <LawChangeIndicator
              jurabk={topicNorm.jurabk}
              paragraphNr={topicNorm.paragraph_nr}
              onOpen={(lawChange) => {
                navigate({
                  search: (prev) => ({
                    ...prev,
                    lawChangeId: lawChange.id,
                  }),
                  replace: true,
                  resetScroll: false,
                });
              }}
            />
          ) : null}
        </span>
        <span className="pointer-events-auto relative z-10 inline-flex shrink-0 items-center">
          <TooltipWrapper
            content={t('aiAssistance.satzeChecked', {
              checked: satzProgress.checkedCount,
              total: satzProgress.totalCount,
            })}
          >
            <span
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- tooltip trigger anchor; role="img" is intentional for a status indicator, tabIndex makes it keyboard-reachable
              tabIndex={0}
              role="img"
              aria-label={t('aiAssistance.satzeChecked', {
                checked: satzProgress.checkedCount,
                total: satzProgress.totalCount,
              })}
              className="focus-ring inline-flex cursor-default items-center rounded-sm"
            >
              <StatusBadge
                badge={{
                  label: t('aiAssistance.satzeCheckedShort', {
                    checked: satzProgress.checkedCount,
                    total: satzProgress.totalCount,
                  }),
                  variant: satzProgress.allChecked ? 'success' : 'neutral',
                }}
              />
            </span>
          </TooltipWrapper>
        </span>
        {hasBewertung ? (
          <span className="pointer-events-auto relative z-10 inline-flex shrink-0 items-center">
            <TooltipWrapper content={t('aiAssistance.normHasAiRatingTooltip')}>
              <AiSparklesChip
                size="sm"
                role="img"
                aria-label={t('aiAssistance.normHasAiRating')}
              />
            </TooltipWrapper>
          </span>
        ) : null}
      </RpbOverviewItemRow>
      {label ? (
        <Link
          to="/verfahren/$verfahrenId/rpb"
          params={{ verfahrenId }}
          search={(prev) => ({
            ...prev,
            topicNormId: topicNormRef.id,
            showNormtext: undefined,
            satzId: undefined,
            rechtsmethodikSatzId: undefined,
            participationSubtopicId: undefined,
          })}
          resetScroll={false}
          aria-label={label}
          className="focus-ring absolute inset-0 rounded-lg"
        />
      ) : null}
    </div>
  );
};
