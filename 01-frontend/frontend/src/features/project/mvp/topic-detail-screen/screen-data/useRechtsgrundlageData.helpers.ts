import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import { isReviewCompleted } from '@/features/project/versioning/revisionStatus';
import { getStoredParentRefByType } from '../storedParentRefs';

export type TopicNormEntry = {
  topicNorm: NodePayloadByType<'topic_norm'>;
  gesetz: NodePayloadByType<'gesetz'> | null;
  norm: NodePayloadByType<'norm'> | null;
};

export type TopicNormLawGroup = {
  id: string;
  topicNorms: NodePayloadByType<'topic_norm'>[];
};

export type AvailableNormEntry = {
  norm: NodePayloadByType<'norm'>;
  gesetz: NodePayloadByType<'gesetz'> | null;
  topicNorms: NodePayloadByType<'topic_norm'>[];
  topicNorm: NodePayloadByType<'topic_norm'> | null;
};

export type AvailableNormLawGroup = {
  id: string;
  gesetz: NodePayloadByType<'gesetz'> | null;
  norms: AvailableNormEntry[];
};

const paragraphNumberCollator = new Intl.Collator('de', {
  numeric: true,
  sensitivity: 'base',
});

const getParagraphRef = (paragraphNr: string | null) => {
  if (!paragraphNr) {
    return '§';
  }

  return `§ ${paragraphNr}`;
};

const normalizeParagraphNumber = (paragraphNumber: string | null) => {
  return (paragraphNumber ?? '').replace(/^§\s*/, '').trim();
};

const compareParagraphNumbers = (
  leftParagraphNumber: string | null,
  rightParagraphNumber: string | null,
) => {
  return paragraphNumberCollator.compare(
    normalizeParagraphNumber(leftParagraphNumber),
    normalizeParagraphNumber(rightParagraphNumber),
  );
};

export const sortTopicNormsByParagraphNumber = (
  topicNorms: NodePayloadByType<'topic_norm'>[],
) => {
  return [...topicNorms].sort((left, right) => {
    const paragraphComparison = compareParagraphNumbers(
      left.paragraph_nr,
      right.paragraph_nr,
    );

    if (paragraphComparison !== 0) {
      return paragraphComparison;
    }

    return left.id.localeCompare(right.id, 'de');
  });
};

export const sortAvailableNormEntriesByParagraphNumber = (
  normEntries: AvailableNormEntry[],
) => {
  return [...normEntries].sort((left, right) => {
    const paragraphComparison = compareParagraphNumbers(
      left.norm.paragraph_nr,
      right.norm.paragraph_nr,
    );

    if (paragraphComparison !== 0) {
      return paragraphComparison;
    }

    return left.norm.id.localeCompare(right.norm.id, 'de');
  });
};

export const getTopicNormParagraphRef = (topicNormEntry: TopicNormEntry) => {
  return getParagraphRef(topicNormEntry.topicNorm.paragraph_nr);
};

export const getTopicNormTitle = (topicNormEntry: TopicNormEntry) => {
  return topicNormEntry.norm?.paragraph_titel ?? '';
};

export const getTopicNormLabel = (topicNormEntry: TopicNormEntry) => {
  const title = getTopicNormTitle(topicNormEntry);
  const paragraphRef = getTopicNormParagraphRef(topicNormEntry);

  if (!title) {
    return paragraphRef;
  }

  return `${paragraphRef} ${title}`;
};

export const getTopicNormText = (topicNormEntry: TopicNormEntry) => {
  return topicNormEntry.norm?.text ?? '';
};

const getAvailableNormParagraphRef = (normEntry: AvailableNormEntry) => {
  return getParagraphRef(normEntry.norm.paragraph_nr);
};

const getAvailableNormTitle = (normEntry: AvailableNormEntry) => {
  return normEntry.norm.paragraph_titel ?? '';
};

export const getAvailableNormLabel = (normEntry: AvailableNormEntry) => {
  const title = getAvailableNormTitle(normEntry);
  const paragraphRef = getAvailableNormParagraphRef(normEntry);

  if (!title) {
    return paragraphRef;
  }

  return `${paragraphRef} ${title}`;
};

export const getAvailableNormText = (normEntry: AvailableNormEntry) => {
  return normEntry.norm.text;
};

export const isTopicNormChecked = (
  topicNorm: NodePayloadByType<'topic_norm'>,
) => {
  return isReviewCompleted(topicNorm.mvp_status);
};

const createTopicNormLawGroups = (
  topicNorms: NodePayloadByType<'topic_norm'>[],
) => {
  const lawGroupsById = new Map<string, TopicNormLawGroup>();

  for (const topicNorm of topicNorms) {
    const lawGroupId = topicNorm.jurabk;
    const existingLawGroup = lawGroupsById.get(lawGroupId);

    if (existingLawGroup) {
      existingLawGroup.topicNorms.push(topicNorm);
      continue;
    }

    lawGroupsById.set(lawGroupId, {
      id: lawGroupId,
      topicNorms: [topicNorm],
    });
  }

  return Array.from(lawGroupsById.values()).map((lawGroup) => ({
    ...lawGroup,
    topicNorms: sortTopicNormsByParagraphNumber(lawGroup.topicNorms),
  }));
};

export const createTopicNormData = (
  topicNorms: NodePayloadByType<'topic_norm'>[],
) => {
  return {
    topicNormById: new Map(
      topicNorms.map((topicNorm) => [topicNorm.id, topicNorm]),
    ),
    lawGroups: createTopicNormLawGroups(topicNorms),
  };
};

/**
 * Builds the full editable Rechtsgrundlage view model from the project-wide
 * norm corpus and the topic-linked `topic_norm` nodes.
 *
 * @param normen All available norm payloads.
 * @param gesetze All available law payloads referenced by the norms.
 * @param topicNormById Topic-linked `topic_norm` payloads keyed by id.
 * @returns Grouped norm options, the flat option list, and the selected ids.
 */
export const createAvailableRechtsgrundlageData = (
  normen: NodePayloadByType<'norm'>[],
  gesetze: NodePayloadByType<'gesetz'>[],
  topicNormById: Map<string, NodePayloadByType<'topic_norm'>>,
) => {
  const gesetzById = new Map(gesetze.map((gesetz) => [gesetz.id, gesetz]));
  const availableNormEntries = normen.map((norm) => {
    const gesetz = gesetzById.get(norm.gesetz_id) ?? null;
    const topicNorms = norm.frontend_parent_ids
      .map((parentId) => getStoredParentRefByType(parentId, 'topic_norm'))
      .filter(
        (parentRef): parentRef is NodeRefByType<'topic_norm'> =>
          parentRef !== null && topicNormById.has(parentRef.id),
      )
      .flatMap((parentRef) => {
        const topicNorm = topicNormById.get(parentRef.id);

        return topicNorm ? [topicNorm] : [];
      });

    return {
      norm,
      gesetz,
      topicNorms,
      topicNorm: topicNorms[0] ?? null,
    };
  });

  const selectedNormIds = new Set(
    availableNormEntries
      .filter((normEntry) => normEntry.topicNorms.length > 0)
      .map((normEntry) => normEntry.norm.id),
  );
  const availableLawGroupsById = new Map<string, AvailableNormLawGroup>();

  for (const normEntry of availableNormEntries) {
    const lawGroupId = normEntry.gesetz?.id ?? normEntry.norm.gesetz_id;
    const existingLawGroup = availableLawGroupsById.get(lawGroupId);

    if (existingLawGroup) {
      existingLawGroup.norms.push(normEntry);
      continue;
    }

    availableLawGroupsById.set(lawGroupId, {
      id: lawGroupId,
      gesetz: normEntry.gesetz,
      norms: [normEntry],
    });
  }

  return {
    availableLawGroups: Array.from(availableLawGroupsById.values()).map(
      (lawGroup) => ({
        ...lawGroup,
        norms: sortAvailableNormEntriesByParagraphNumber(lawGroup.norms),
      }),
    ),
    availableNormEntries,
    selectedNormIds,
  };
};
