import type { NodePayloadByType } from '@/db/nodes/types';
import { isReviewCompleted } from '@/features/project/versioning/revisionStatus';
import type { AvailableNormEntry } from './availableRechtsgrundlageData';
import { compareParagraphNumbers } from './rechtsgrundlageParagraphNumbers';

export type {
  AvailableNormEntry,
  AvailableNormLawGroup,
  AvailableTopicNormLink,
} from './availableRechtsgrundlageData';
export {
  createAvailableRechtsgrundlageData,
  sortAvailableNormEntriesByParagraphNumber,
} from './availableRechtsgrundlageData';
export {
  createLegalBasisSelectionKey,
  normalizeParagraphNumber,
} from './rechtsgrundlageParagraphNumbers';

export type TopicNormEntry = {
  topicNorm: NodePayloadByType<'topic_norm'>;
  gesetz: NodePayloadByType<'gesetz'> | null;
  norm: NodePayloadByType<'norm'> | null;
};

export type TopicNormLawGroup = {
  id: string;
  topicNorms: NodePayloadByType<'topic_norm'>[];
};

const getParagraphRef = (paragraphNr: string | null) => {
  if (!paragraphNr) {
    return '§';
  }

  return `§ ${paragraphNr}`;
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
  return normEntry.norm.text ?? '';
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
