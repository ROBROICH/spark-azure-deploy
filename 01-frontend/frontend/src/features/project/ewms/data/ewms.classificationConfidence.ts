import type { EwmsArgumentNode } from './ewms.nodes';

export const EWMS_CLASSIFICATION_CONFIDENCE_THRESHOLD = 0.75;

export type ClassificationUncertaintyVariant = 'topic' | 'subtopic' | 'both';

const isUncertainLevel = (value: number | null | undefined) =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value < EWMS_CLASSIFICATION_CONFIDENCE_THRESHOLD;

export const getClassificationUncertainty = (
  argument: Pick<EwmsArgumentNode, 'topicConfidence' | 'subTopicConfidence'>,
): ClassificationUncertaintyVariant | null => {
  const topicUncertain = isUncertainLevel(argument.topicConfidence);
  const subtopicUncertain = isUncertainLevel(argument.subTopicConfidence);

  if (topicUncertain && subtopicUncertain) {
    return 'both';
  }

  if (topicUncertain) {
    return 'topic';
  }

  if (subtopicUncertain) {
    return 'subtopic';
  }

  return null;
};
