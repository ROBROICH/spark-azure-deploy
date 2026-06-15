import { toCompositeKey } from '@/db/nodes/compositeKey';
import {
  getDescendantNodeRefsByType,
  type ProjectNodeIndex,
} from '@/db/nodes/examinationGraphModel';
import { useDescendantNodes } from '@/db/nodes/hooks/useDescendantNodes';
import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import type { NodeRefByType } from '@/db/nodes/types';
import {
  AccordionContent,
  AccordionItem,
} from '@/features/ui/accordion/Accordion';
import { Skeleton } from '@/features/ui/skeleton/Skeleton';
import { cn } from '@/features/ui/style/cn';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ChevronRight, Mail } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RPB_OVERVIEW_ITEM_ROW_CONTENT_CLASS_NAME,
  RPB_OVERVIEW_ITEM_ROW_ROOT_CLASS_NAME,
} from '../shared/ItemRow';
import { AiSectionTrigger } from '../shared/AiSectionTrigger';
import {
  type RpbSubtopicNode,
  RPB_PARTICIPATION_SONSTIGE_SUBTOPIC_ID,
} from './rpbParticipationArguments';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

const AiParticipationSubtopicListSkeleton = () => (
  <div className="flex flex-col gap-2 pb-2">
    {[0, 1, 2].map((index) => (
      <div key={index} className={RPB_OVERVIEW_ITEM_ROW_ROOT_CLASS_NAME}>
        <div className={RPB_OVERVIEW_ITEM_ROW_CONTENT_CLASS_NAME}>
          <Skeleton className="h-4 flex-1" aria-hidden />
          <Skeleton className="h-6 w-24 rounded-full" aria-hidden />
          <Skeleton className="size-4 rounded-sm" aria-hidden />
        </div>
      </div>
    ))}
  </div>
);

type AiParticipationSubtopicListProps = {
  topicRef: NodeRefByType<'topic'>;
};

type ParticipationSubtopicItem = {
  id: string;
  label: string;
  totalCount: number;
};

type CountedRealSubtopicItem = ParticipationSubtopicItem & {
  argumentKeys: string[];
};

const compareParticipationSubtopicItems = (
  left: ParticipationSubtopicItem,
  right: ParticipationSubtopicItem,
) => {
  const countBucketComparison =
    Number(right.totalCount > 0) - Number(left.totalCount > 0);

  if (countBucketComparison !== 0) {
    return countBucketComparison;
  }

  return left.label.localeCompare(right.label, 'de', {
    numeric: true,
    sensitivity: 'base',
  });
};

const buildRealSubtopicItems = (
  index: ProjectNodeIndex,
  subtopics: RpbSubtopicNode[],
): CountedRealSubtopicItem[] => {
  return subtopics.map((subtopic) => {
    const argumentRefs = getDescendantNodeRefsByType(
      index,
      subtopic.id,
      'argument',
    );

    return {
      id: subtopic.id,
      label: subtopic.name,
      totalCount: argumentRefs.length,
      argumentKeys: argumentRefs.map((argumentRef) =>
        toCompositeKey(argumentRef),
      ),
    };
  });
};

const countSonstigeArguments = (
  index: ProjectNodeIndex,
  topicRef: NodeRefByType<'topic'>,
  subtopicItems: CountedRealSubtopicItem[],
) => {
  const assignedArgumentKeys = new Set(
    subtopicItems.flatMap((item) => item.argumentKeys),
  );
  const topicArgumentRefs = getDescendantNodeRefsByType(
    index,
    topicRef.id,
    'argument',
  );

  return topicArgumentRefs.filter(
    (argumentRef) => !assignedArgumentKeys.has(toCompositeKey(argumentRef)),
  ).length;
};

const insertSonstigeBeforeZeroCountItems = (
  items: ParticipationSubtopicItem[],
  sonstigeItem: ParticipationSubtopicItem,
) => {
  const firstZeroIndex = items.findIndex((item) => item.totalCount === 0);

  if (firstZeroIndex === -1) {
    return [...items, sonstigeItem];
  }

  return [
    ...items.slice(0, firstZeroIndex),
    sonstigeItem,
    ...items.slice(firstZeroIndex),
  ];
};

const buildParticipationSubtopicItems = (
  index: ProjectNodeIndex,
  topicRef: NodeRefByType<'topic'>,
  subtopics: RpbSubtopicNode[],
  sonstigeLabel: string,
): ParticipationSubtopicItem[] => {
  const realSubtopicItems = buildRealSubtopicItems(index, subtopics);
  const sortedItems = [...realSubtopicItems].sort(
    compareParticipationSubtopicItems,
  );
  const sonstigeCount = countSonstigeArguments(
    index,
    topicRef,
    realSubtopicItems,
  );

  if (sonstigeCount === 0) {
    return sortedItems;
  }

  return insertSonstigeBeforeZeroCountItems(sortedItems, {
    id: RPB_PARTICIPATION_SONSTIGE_SUBTOPIC_ID,
    label: sonstigeLabel,
    totalCount: sonstigeCount,
  });
};

type AiParticipationSubtopicRowProps = {
  item: ParticipationSubtopicItem;
  verfahrenId: string;
};

const AiParticipationSubtopicRow = (props: AiParticipationSubtopicRowProps) => {
  const { item, verfahrenId } = props;
  const label = `${item.label} (${item.totalCount})`;

  if (item.totalCount === 0) {
    return (
      <div
        aria-disabled="true"
        className={cn(
          RPB_OVERVIEW_ITEM_ROW_ROOT_CLASS_NAME,
          'bg-slate-50 text-slate-400',
        )}
      >
        <span className={RPB_OVERVIEW_ITEM_ROW_CONTENT_CLASS_NAME}>
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </span>
      </div>
    );
  }

  return (
    <Link
      to="/verfahren/$verfahrenId/rpb"
      params={{ verfahrenId }}
      search={(prev) => ({
        ...prev,
        aiOverviewSection: 'beteiligungseingaenge',
        participationSubtopicId: item.id,
        topicNormId: undefined,
        showNormtext: undefined,
        satzId: undefined,
        rechtsmethodikSatzId: undefined,
      })}
      resetScroll={false}
      className={cn(
        RPB_OVERVIEW_ITEM_ROW_ROOT_CLASS_NAME,
        'focus-ring-inset hover:bg-surface-secondary cursor-pointer text-left transition-colors',
      )}
    >
      <span className={RPB_OVERVIEW_ITEM_ROW_CONTENT_CLASS_NAME}>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight
          aria-hidden="true"
          className="text-content-tertiary size-4 shrink-0"
        />
      </span>
    </Link>
  );
};

const useParticipationSubtopicItems = (topicRef: NodeRefByType<'topic'>) => {
  const { t } = useTranslation('Rpb');
  const { data: topicSubtopics } = useDescendantNodes('subtopic', topicRef);
  const { index } = useGraph();
  const sonstigeLabel = t('aiAssistance.participationSonstige');

  return buildParticipationSubtopicItems(
    index,
    topicRef,
    topicSubtopics,
    sonstigeLabel,
  );
};

/**
 * Renders topic subtopics with argument counts and keeps zero-count subtopics
 * visible but disabled so users can see the full topic structure.
 */
const AiParticipationSubtopicList = (
  props: AiParticipationSubtopicListProps,
) => {
  const { topicRef } = props;
  const { t } = useTranslation('Rpb');
  const { verfahrenId } = route.useParams();
  const items = useParticipationSubtopicItems(topicRef);

  if (items.length === 0) {
    return (
      <p className="text-content-secondary pb-2 text-[13px] leading-[18px]">
        {t('aiAssistance.participationNoArguments')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2 pb-2">
      {items.map((item) => (
        <AiParticipationSubtopicRow
          key={item.id}
          item={item}
          verfahrenId={verfahrenId}
        />
      ))}
    </div>
  );
};

export const AiParticipationSection = () => {
  const { t } = useTranslation('Rpb');
  const topicId = route.useSearch({
    select: (search) => search.topicId,
  });
  const topicRef = topicId
    ? ({
        id: topicId,
        node_type: 'topic',
      } satisfies NodeRefByType<'topic'>)
    : null;
  const argumentRefs = useDescendants('argument', topicRef);

  return (
    <AccordionItem
      value="beteiligungseingaenge"
      className="border-t border-border-primary"
    >
      <AiSectionTrigger
        icon={Mail}
        titleKey="aiAssistance.participationTitle"
        count={argumentRefs.length}
      />
      <AccordionContent className="pt-2">
        {topicRef ? (
          <Suspense fallback={<AiParticipationSubtopicListSkeleton />}>
            <AiParticipationSubtopicList topicRef={topicRef} />
          </Suspense>
        ) : (
          <p className="text-content-secondary pb-2 text-[13px] leading-[18px]">
            {t('aiAssistance.participationSelectTopicHint')}
          </p>
        )}
      </AccordionContent>
    </AccordionItem>
  );
};
