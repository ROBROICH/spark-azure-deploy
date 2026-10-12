import { describe, expect, it } from 'vitest';
import {
  EWMS_CLASSIFICATION_CONFIDENCE_THRESHOLD,
  getClassificationUncertainty,
} from './ewms.classificationConfidence';

describe('getClassificationUncertainty', () => {
  it('returns topic when only the topic confidence is below the threshold', () => {
    expect(
      getClassificationUncertainty({
        topicConfidence: 0.74,
        subTopicConfidence: 0.75,
      }),
    ).toBe('topic');
    expect(
      getClassificationUncertainty({
        topicConfidence: 0.4,
        subTopicConfidence: null,
      }),
    ).toBe('topic');
  });

  it('returns subtopic when only the subtopic confidence is below the threshold', () => {
    expect(
      getClassificationUncertainty({
        topicConfidence: 0.75,
        subTopicConfidence: 0.74,
      }),
    ).toBe('subtopic');
  });

  it('returns both when topic and subtopic confidences are below the threshold', () => {
    expect(
      getClassificationUncertainty({
        topicConfidence: 0.4,
        subTopicConfidence: 0.5,
      }),
    ).toBe('both');
  });

  it('returns null at the exact threshold and for missing values', () => {
    expect(EWMS_CLASSIFICATION_CONFIDENCE_THRESHOLD).toBe(0.75);
    expect(
      getClassificationUncertainty({
        topicConfidence: 0.75,
        subTopicConfidence: 0.75,
      }),
    ).toBeNull();
    expect(
      getClassificationUncertainty({
        topicConfidence: null,
        subTopicConfidence: null,
      }),
    ).toBeNull();
    expect(
      getClassificationUncertainty({
        topicConfidence: Number.NaN,
        subTopicConfidence: Number.POSITIVE_INFINITY,
      }),
    ).toBeNull();
  });
});
