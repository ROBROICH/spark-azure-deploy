import {
  Accordion,
  AccordionContent,
  AccordionItem,
} from '@/features/ui/accordion/Accordion';
import { useDescendantNodes } from '@/db/nodes/hooks/useDescendantNodes';
import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import { getRouteApi } from '@tanstack/react-router';
import { Section } from 'lucide-react';
import { useEffect } from 'react';
import { AiLegalBasisLawGroup } from './AiLegalBasisLawGroup';
import { AiSectionTrigger } from '../shared/AiSectionTrigger';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');
const paragraphNumberCollator = new Intl.Collator('de', {
  numeric: true,
  sensitivity: 'base',
});

const normalizeParagraphNumber = (paragraphNumber: string | null) => {
  return (paragraphNumber ?? '').replace(/^§\s*/, '').trim();
};

export const sortTopicNormRefsByParagraphNumber = (
  topicNormRefs: NodeRefByType<'topic_norm'>[],
  topicNormsById: Map<string, NodePayloadByType<'topic_norm'>>,
) => {
  return [...topicNormRefs].sort((left, right) => {
    const leftTopicNorm = topicNormsById.get(left.id);
    const rightTopicNorm = topicNormsById.get(right.id);

    if (!leftTopicNorm || !rightTopicNorm) {
      return left.id.localeCompare(right.id, 'de');
    }

    const paragraphComparison = paragraphNumberCollator.compare(
      normalizeParagraphNumber(leftTopicNorm.paragraphNr),
      normalizeParagraphNumber(rightTopicNorm.paragraphNr),
    );

    if (paragraphComparison !== 0) {
      return paragraphComparison;
    }

    return left.id.localeCompare(right.id, 'de');
  });
};

/**
 * Groups the selected topic's norms by law abbreviation and derives the
 * expanded law group from the current route state.
 */
export const AiLegalBasisSection = () => {
  const { gesetzId, topicId } = route.useSearch({
    select: (search) => ({
      gesetzId: search.gesetzId,
      topicId: search.topicId,
    }),
  });
  const navigate = route.useNavigate();
  const topicRef = topicId
    ? ({
        id: topicId,
        nodeType: 'topic',
      } satisfies NodeRefByType<'topic'>)
    : null;
  const { data: topicNorms } = useDescendantNodes('topic_norm', topicRef);
  const topicNormsById = new Map(
    topicNorms.map((topicNorm) => [topicNorm.id, topicNorm]),
  );
  const topicNormRefsById = new Map(
    topicNorms.map((topicNorm) => [
      topicNorm.id,
      {
        id: topicNorm.id,
        nodeType: 'topic_norm',
      } satisfies NodeRefByType<'topic_norm'>,
    ]),
  );
  const lawGroups: [string, NodeRefByType<'topic_norm'>[]][] = Object.entries(
    topicNorms.reduce<Record<string, NodeRefByType<'topic_norm'>[]>>(
      (groups, topicNorm) => {
        const topicNormRef = topicNormRefsById.get(topicNorm.id);

        if (!topicNormRef) {
          return groups;
        }

        const group = groups[topicNorm.jurabk] ?? [];
        group.push(topicNormRef);
        groups[topicNorm.jurabk] = group;
        return groups;
      },
      {},
    ),
  ).map(([jurabk, groupTopicNormRefs]) => {
    return [
      jurabk,
      sortTopicNormRefsByParagraphNumber(groupTopicNormRefs, topicNormsById),
    ];
  });
  const selectedGesetzId = gesetzId
    ? lawGroups.some(([jurabk]) => jurabk === gesetzId)
      ? gesetzId
      : undefined
    : undefined;

  // eslint-disable-next-line no-restricted-syntax -- repairs stale URL state when the selected topic no longer exposes the routed law group
  useEffect(() => {
    if (!gesetzId || selectedGesetzId) {
      return;
    }

    void navigate({
      search: (prev) => ({
        ...prev,
        gesetzId: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  }, [gesetzId, navigate, selectedGesetzId]);

  const handleExpandedGesetzChange = (nextGesetzId: string) => {
    void navigate({
      search: (prev) => ({
        ...prev,
        gesetzId: nextGesetzId || undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <AccordionItem value="rechtsgrundlage">
      <AiSectionTrigger
        icon={Section}
        titleKey="aiAssistance.legalBasisTitle"
        count={lawGroups.length}
      />
      <AccordionContent>
        <div className="flex flex-col gap-2 pt-2 pb-2">
          <Accordion
            type="single"
            collapsible
            value={selectedGesetzId ?? ''}
            onValueChange={handleExpandedGesetzChange}
            className="flex flex-col gap-1"
          >
            {lawGroups.map(([jurabk, groupTopicNormRefs]) => (
              <AiLegalBasisLawGroup
                key={jurabk}
                jurabk={jurabk}
                topicNormRefs={groupTopicNormRefs}
              />
            ))}
          </Accordion>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
};
