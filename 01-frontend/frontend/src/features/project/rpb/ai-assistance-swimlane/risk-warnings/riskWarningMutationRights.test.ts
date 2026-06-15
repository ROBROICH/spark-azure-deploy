import { describe, expect, it, vi } from 'vitest';
import { canMutateRiskWarningForTopic } from './riskWarningMutationRights';

describe('canMutateRiskWarningForTopic', () => {
  it('uses project mutation rights for intentional no-topic risk warnings', () => {
    const hasTopicMutationRights = vi.fn(() => false);

    expect(
      canMutateRiskWarningForTopic(null, {
        canMutateProject: true,
        hasTopicMutationRights,
      }),
    ).toBe(true);
    expect(
      canMutateRiskWarningForTopic(null, {
        canMutateProject: false,
        hasTopicMutationRights,
      }),
    ).toBe(false);
    expect(hasTopicMutationRights).not.toHaveBeenCalled();
  });

  it('uses topic mutation rights for resolved topic risk warnings', () => {
    const hasTopicMutationRights = vi.fn((topicId: string) => {
      return topicId === 'topic-1';
    });

    expect(
      canMutateRiskWarningForTopic('topic-1', {
        canMutateProject: false,
        hasTopicMutationRights,
      }),
    ).toBe(true);
    expect(hasTopicMutationRights).toHaveBeenCalledWith('topic-1');
  });

  it('fails closed for unresolved topic ownership', () => {
    const hasTopicMutationRights = vi.fn(() => true);

    expect(
      canMutateRiskWarningForTopic(undefined, {
        canMutateProject: true,
        hasTopicMutationRights,
      }),
    ).toBe(false);
    expect(hasTopicMutationRights).not.toHaveBeenCalled();
  });
});
