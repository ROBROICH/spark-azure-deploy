import type {
  NodePayloadByType,
  NodeRef,
  NodeRefByType,
} from '@/db/nodes/types';
import { AggregatedLawChangeIndicator } from '@/features/project/law-changes/ui/AggregatedLawChangeIndicator';
import {
  AccordionChevron,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useNodes } from '@/db/nodes/hooks/useNodes';
import { areAllSatzStatusesChecked } from '@/features/project/versioning/revisionStatus';
import { cn } from '@/features/ui/style/cn';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { AiTopicNormRow } from './AiTopicNormRow';
import { AiTopicNormRowSkeleton } from './AiTopicNormRowSkeleton';
import { StatusBadge } from '../shared/StatusBadge';

type AiLegalBasisLawGroupProps = {
  jurabk: string;
  topicNormRefs: NodeRefByType<'topic_norm'>[];
};

const isSatzRef = (nodeRef: NodeRef): nodeRef is NodeRefByType<'satz'> => {
  return nodeRef.nodeType === 'satz';
};

const getUniqueSatzIds = (satzRefs: NodeRefByType<'satz'>[]) => {
  return Array.from(new Set(satzRefs.map((satzRef) => satzRef.id)));
};

const isTopicNormFullyChecked = (
  topicNorm: NodePayloadByType<'topic_norm'>,
  satzIds: string[],
) => {
  if (satzIds.length === 0) {
    return false;
  }

  return areAllSatzStatusesChecked(topicNorm.satzStatuses, satzIds);
};

export const AiLegalBasisLawGroup = (props: AiLegalBasisLawGroupProps) => {
  const { jurabk, topicNormRefs } = props;
  const { t } = useTranslation('Rpb');
  const { data: topicNorms } = useNodes(topicNormRefs);
  const { getDescendants } = useGraph();
  const reviewedNormsCount = topicNorms.filter((topicNorm) => {
    const satzIds = getUniqueSatzIds(
      getDescendants(topicNorm.id).filter(isSatzRef),
    );

    return isTopicNormFullyChecked(topicNorm, satzIds);
  }).length;
  const badgeVariant =
    reviewedNormsCount > 0 && reviewedNormsCount === topicNormRefs.length
      ? 'success'
      : 'neutral';

  return (
    <AccordionItem value={jurabk}>
      <div className="relative">
        <AccordionTrigger
          className={cn(
            'focus-ring-inset data-open-selected-ring-inset flex w-full min-w-0 items-center gap-2 rounded-lg bg-bg-secondary p-2 pr-48',
          )}
        >
          <AccordionChevron className="text-content-secondary" />
          <span className="min-w-0 flex-1 truncate text-left text-[13px] leading-[18px] font-medium tracking-[-0.13px] text-brand-950">
            {jurabk}
          </span>
        </AccordionTrigger>
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center gap-2 pr-2">
          <span className="pointer-events-auto inline-flex shrink-0">
            <AggregatedLawChangeIndicator
              norms={topicNorms.map((topicNorm) => ({
                jurabk: topicNorm.jurabk,
                paragraphNr: topicNorm.paragraphNr,
              }))}
            />
          </span>
          <StatusBadge
            badge={{
              label: t('aiAssistance.normsChecked', {
                checked: reviewedNormsCount,
                total: topicNormRefs.length,
              }),
              variant: badgeVariant,
            }}
          />
        </div>
      </div>
      <AccordionContent>
        <div className="flex flex-col gap-1 py-1 pl-6" {...skeletonListProps}>
          {topicNormRefs.map((topicNormRef) => (
            <Suspense
              key={topicNormRef.id}
              fallback={<AiTopicNormRowSkeleton />}
            >
              <AiTopicNormRow topicNormRef={topicNormRef} />
            </Suspense>
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
