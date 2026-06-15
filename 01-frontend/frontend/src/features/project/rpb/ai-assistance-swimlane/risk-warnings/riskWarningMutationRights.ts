export type RiskWarningTopicMutationRights = {
  canMutateProject: boolean;
  hasTopicMutationRights: (topicId: string) => boolean;
};

/**
 * Risikohinweise attached to an intentional no-topic outline node are project
 * scoped: project team mutation rights are enough. Resolved topic ids still use
 * the topic-specific guard, while unresolved ids fail closed.
 */
export const canMutateRiskWarningForTopic = (
  topicId: string | null | undefined,
  rights: RiskWarningTopicMutationRights,
) => {
  if (topicId === null) {
    return rights.canMutateProject;
  }

  if (topicId === undefined) {
    return false;
  }

  return rights.hasTopicMutationRights(topicId);
};
