import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useHasTopicMutationRights } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import { useAction } from '@/db/nodes/hooks/useAction';
import type { EwmsArgumentNode, EwmsArgumentStatus } from '../data/ewms.nodes';
import {
  EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED,
  isEwmsArgumentApproved,
  isEwmsArgumentTopicReviewOpen,
  normalizeEwmsArgumentStatus,
} from '../data/ewms.nodes';
import { useEwmsSubtopics } from './EwmsSubtopicsContext';

const getNextStatusAfterClassificationChange = (argument: EwmsArgumentNode) =>
  isEwmsArgumentTopicReviewOpen(argument)
    ? EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED
    : normalizeEwmsArgumentStatus(argument.status);

type UpdateArgument = ReturnType<typeof useAction>['update'];
type Transact = ReturnType<typeof useAction>['transact'];
type DeleteArgument = ReturnType<typeof useAction>['delete'];
type HasTopicMutationRights = (topicId: string | null | undefined) => boolean;
type TrackPersistenceForNodeSummaryRefetch = (
  promise: Promise<unknown>,
) => void;
type ArgumentMutationDependencies = {
  canMutateProject: boolean;
  deleteNode: DeleteArgument;
  hasTopicMutationRights: HasTopicMutationRights;
  trackPersistenceForNodeSummaryRefetch: TrackPersistenceForNodeSummaryRefetch;
  transact: Transact;
  update: UpdateArgument;
};

const canMutateArgument = (
  canMutateProject: boolean,
  hasTopicMutationRights: HasTopicMutationRights,
  argument: EwmsArgumentNode,
  targetTopicId?: string,
) =>
  canMutateProject &&
  (!argument.topicId || hasTopicMutationRights(argument.topicId)) &&
  (!targetTopicId || hasTopicMutationRights(targetTopicId));

const transactIfArgumentAuthorized = (
  dependencies: ArgumentMutationDependencies,
  argument: EwmsArgumentNode,
  callback: () => void,
  targetTopicId?: string,
) => {
  if (
    canMutateArgument(
      dependencies.canMutateProject,
      dependencies.hasTopicMutationRights,
      argument,
      targetTopicId,
    )
  ) {
    return dependencies.transact(callback);
  }

  return null;
};

const updateArgumentStatus = (
  update: UpdateArgument,
  argument: EwmsArgumentNode,
  status: EwmsArgumentStatus,
) => {
  update(argument, (draft) => {
    draft.status = status;
  });
};

const updateArgumentClassification = (
  update: UpdateArgument,
  argument: EwmsArgumentNode,
  values: { subtopicId?: string; topicId?: string },
) => {
  update(argument, (draft) => {
    if (values.topicId !== undefined) {
      draft.topicId = values.topicId || null;
      draft.subTopicId = null;
    }
    if (values.subtopicId !== undefined) {
      draft.subTopicId = values.subtopicId || null;
    }
    draft.status = getNextStatusAfterClassificationChange(argument);
  });
};

const createHandleDeleteArgument =
  (dependencies: ArgumentMutationDependencies) =>
  (argument: EwmsArgumentNode) => {
    transactIfArgumentAuthorized(dependencies, argument, () => {
      dependencies.deleteNode(argument);
    });
  };

const createHandleSetArgumentsApproval =
  (dependencies: ArgumentMutationDependencies) =>
  (argumentsList: EwmsArgumentNode[], checked: boolean) => {
    const authorizedArguments = argumentsList.filter((argument) =>
      canMutateArgument(
        dependencies.canMutateProject,
        dependencies.hasTopicMutationRights,
        argument,
      ),
    );

    if (authorizedArguments.length === 0) {
      return;
    }

    dependencies.transact(() => {
      for (const argument of authorizedArguments) {
        updateArgumentStatus(
          dependencies.update,
          argument,
          checked ? 'done' : EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED,
        );
      }
    });
  };

const createHandleToggleArgument =
  (dependencies: ArgumentMutationDependencies) =>
  (argument: EwmsArgumentNode) => {
    transactIfArgumentAuthorized(dependencies, argument, () => {
      updateArgumentStatus(
        dependencies.update,
        argument,
        isEwmsArgumentApproved(argument)
          ? EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED
          : 'done',
      );
    });
  };

const createHandleReviewArgumentClassification =
  (dependencies: ArgumentMutationDependencies) =>
  (argument: EwmsArgumentNode, isAccepted: boolean) => {
    const tx = transactIfArgumentAuthorized(dependencies, argument, () => {
      dependencies.update(argument, (draft) => {
        draft.status = EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED;
        if (!isAccepted) {
          draft.topicId = null;
          draft.subTopicId = null;
        }
      });
    });

    if (tx && !isAccepted) {
      dependencies.trackPersistenceForNodeSummaryRefetch(
        tx.isPersisted.promise,
      );
    }
  };

const createHandleUpdateArgumentSubtopic =
  (dependencies: ArgumentMutationDependencies) =>
  (argument: EwmsArgumentNode, subtopicId: string) => {
    const tx = transactIfArgumentAuthorized(dependencies, argument, () =>
      updateArgumentClassification(dependencies.update, argument, {
        subtopicId,
      }),
    );

    if (tx) {
      dependencies.trackPersistenceForNodeSummaryRefetch(
        tx.isPersisted.promise,
      );
    }
  };

const createHandleUpdateArgumentTopic =
  (dependencies: ArgumentMutationDependencies) =>
  (argument: EwmsArgumentNode, topicId: string) => {
    const tx = transactIfArgumentAuthorized(
      dependencies,
      argument,
      () =>
        updateArgumentClassification(dependencies.update, argument, {
          topicId,
        }),
      topicId || undefined,
    );

    if (tx) {
      dependencies.trackPersistenceForNodeSummaryRefetch(
        tx.isPersisted.promise,
      );
    }
  };

/**
 * Creates EWMS argument mutation handlers with both project and topic guards.
 */
export const useEwmsArgumentMutations = () => {
  const { trackPersistenceForNodeSummaryRefetch } = useEwmsSubtopics();
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const hasTopicMutationRights = useHasTopicMutationRights();
  const { transact, update, delete: deleteNode } = useAction();
  const dependencies = {
    canMutateProject,
    deleteNode,
    hasTopicMutationRights,
    trackPersistenceForNodeSummaryRefetch,
    transact,
    update,
  };

  return {
    handleDeleteArgument: createHandleDeleteArgument(dependencies),
    handleSetArgumentsApproval: createHandleSetArgumentsApproval(dependencies),
    handleToggleArgument: createHandleToggleArgument(dependencies),
    handleReviewArgumentClassification:
      createHandleReviewArgumentClassification(dependencies),
    handleUpdateArgumentSubtopic:
      createHandleUpdateArgumentSubtopic(dependencies),
    handleUpdateArgumentTopic: createHandleUpdateArgumentTopic(dependencies),
  };
};
