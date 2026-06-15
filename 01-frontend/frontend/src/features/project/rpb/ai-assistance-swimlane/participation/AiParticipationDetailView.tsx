import { useDescendantNodes } from '@/db/nodes/hooks/useDescendantNodes';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useNode, useNodes } from '@/db/nodes/hooks/useNodes';
import type { NodeRefByType } from '@/db/nodes/types';
import { useHasTopicMutationRights } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import { Button } from '@/features/ui/button/Button';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { clearRpbTopicScopedSearch } from '../../rpb.search';
import { AiParticipationArgumentCardSkeleton } from './AiParticipationArgumentCard';
import { AiParticipationArgumentVirtualList } from './AiParticipationArgumentVirtualList';
import { AiTopicHeader } from '../shared/AiTopicHeader';
import {
  buildRpbParticipationSubtopicItemFromArguments,
  getRpbSonstigeArgumentRefs,
  RPB_PARTICIPATION_SONSTIGE_SUBTOPIC_ID,
} from './rpbParticipationArguments';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

const AiParticipationArgumentListSkeleton = () => {
  return (
    <div className="flex flex-col gap-2" role="list">
      {[0, 1, 2].map((index) => (
        <div key={index} role="listitem">
          <AiParticipationArgumentCardSkeleton />
        </div>
      ))}
    </div>
  );
};

type AiParticipationArgumentListProps = {
  topicRef: NodeRefByType<'topic'> | null;
  participationSubtopicId: string | undefined;
};

type AiParticipationSonstigeArgumentListProps = {
  canMutate: boolean;
  topicRef: NodeRefByType<'topic'> | null;
};

const AiParticipationSonstigeArgumentList = (
  props: AiParticipationSonstigeArgumentListProps,
) => {
  const { canMutate, topicRef } = props;
  const { t } = useTranslation('Rpb');
  const { index } = useGraph();
  const sonstigeArgumentRefs = topicRef
    ? getRpbSonstigeArgumentRefs(index, topicRef)
    : [];
  const { data: sonstigeArguments } = useNodes(sonstigeArgumentRefs);
  const item = buildRpbParticipationSubtopicItemFromArguments(
    RPB_PARTICIPATION_SONSTIGE_SUBTOPIC_ID,
    t('aiAssistance.participationSonstige'),
    sonstigeArguments,
    true,
  );

  if (!topicRef) {
    return (
      <p className="text-content-secondary text-[13px] leading-[18px]">
        {t('aiAssistance.participationSelectTopicHint')}
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-[16px] leading-[20px] font-medium tracking-[-0.16px] text-brand-950">
          {item.label}
        </h2>
        <span className="text-content-secondary shrink-0 text-[11px] leading-[14px] font-medium">
          {t('aiAssistance.participationArgumentsCount', {
            count: item.totalCount,
          })}
        </span>
      </div>
      <AiParticipationArgumentVirtualList
        argumentsList={item.arguments}
        canMutate={canMutate}
      />
    </>
  );
};

type AiParticipationRealSubtopicArgumentListProps = {
  routeTopicId: string | undefined;
  subtopicRef: NodeRefByType<'subtopic'>;
};

const AiParticipationRealSubtopicArgumentList = (
  props: AiParticipationRealSubtopicArgumentListProps,
) => {
  const { routeTopicId, subtopicRef } = props;
  const { t } = useTranslation('Rpb');
  const hasTopicMutationRights = useHasTopicMutationRights();
  const { data: subtopic } = useNode(subtopicRef);
  const { data: subtopicArguments } = useDescendantNodes(
    'argument',
    subtopicRef,
  );
  const subtopicOwnerTopicId = subtopic?.topic_id;
  const canMutate =
    Boolean(subtopicOwnerTopicId) &&
    subtopicOwnerTopicId === routeTopicId &&
    hasTopicMutationRights(subtopicOwnerTopicId);

  if (!subtopic) {
    return (
      <p className="text-content-secondary text-[13px] leading-[18px]">
        {t('aiAssistance.participationNoArgumentsForSubtopic')}
      </p>
    );
  }

  const item = buildRpbParticipationSubtopicItemFromArguments(
    subtopicRef.id,
    subtopic.name,
    subtopicArguments,
  );

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate text-[16px] leading-[20px] font-medium tracking-[-0.16px] text-brand-950">
          {item.label}
        </h2>
        <span className="text-content-secondary shrink-0 text-[11px] leading-[14px] font-medium">
          {t('aiAssistance.participationArgumentsCount', {
            count: item.totalCount,
          })}
        </span>
      </div>
      <AiParticipationArgumentVirtualList
        argumentsList={item.arguments}
        canMutate={canMutate}
      />
    </>
  );
};

const AiParticipationArgumentList = (
  props: AiParticipationArgumentListProps,
) => {
  const { participationSubtopicId, topicRef } = props;
  const { t } = useTranslation('Rpb');
  const hasTopicMutationRights = useHasTopicMutationRights();
  const canMutateTopic = hasTopicMutationRights(topicRef?.id);

  if (!topicRef) {
    return (
      <p className="text-content-secondary text-[13px] leading-[18px]">
        {t('aiAssistance.participationSelectTopicHint')}
      </p>
    );
  }

  if (!participationSubtopicId) {
    return (
      <p className="text-content-secondary text-[13px] leading-[18px]">
        {t('aiAssistance.participationNoArgumentsForSubtopic')}
      </p>
    );
  }

  if (participationSubtopicId === RPB_PARTICIPATION_SONSTIGE_SUBTOPIC_ID) {
    return (
      <AiParticipationSonstigeArgumentList
        canMutate={canMutateTopic}
        topicRef={topicRef}
      />
    );
  }

  return (
    <AiParticipationRealSubtopicArgumentList
      routeTopicId={topicRef.id}
      subtopicRef={{
        id: participationSubtopicId,
        node_type: 'subtopic',
      }}
    />
  );
};

export const AiParticipationDetailView = () => {
  const { t } = useTranslation('Rpb');
  const { verfahrenId } = route.useParams();
  const { participationSubtopicId, topicId } = route.useSearch({
    select: (search) => ({
      participationSubtopicId: search.participationSubtopicId,
      topicId: search.topicId,
    }),
  });
  const topicRef = topicId
    ? ({
        id: topicId,
        node_type: 'topic',
      } satisfies NodeRefByType<'topic'>)
    : null;

  return (
    <>
      <AiTopicHeader
        titleKey="aiAssistance.participationTitle"
        showTopicSelect={false}
        leading={
          <Button
            asChild
            iconOnly
            variant="secondary"
            aria-label={t('aiAssistance.backToOverview')}
          >
            <Link
              to="/verfahren/$verfahrenId/rpb"
              params={{ verfahrenId }}
              search={(prev) => ({
                ...clearRpbTopicScopedSearch(prev),
                aiOverviewSection: 'beteiligungseingaenge',
              })}
              resetScroll={false}
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-2">
        <Suspense fallback={<AiParticipationArgumentListSkeleton />}>
          <AiParticipationArgumentList
            topicRef={topicRef}
            participationSubtopicId={participationSubtopicId}
          />
        </Suspense>
      </div>
    </>
  );
};
