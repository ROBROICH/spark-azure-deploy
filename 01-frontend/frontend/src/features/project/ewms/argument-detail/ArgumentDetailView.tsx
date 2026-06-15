import { useNode } from '@/db/nodes/hooks/useNodes';
import type { NodeRefByType } from '@/db/nodes/types';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useHasTopicMutationRights } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import { useAction } from '@/db/nodes/hooks/useAction';
import { useControllableState } from '@/features/ui/state/useControllableState';
import { useCallback, useEffect, useRef } from 'react';
import { ArgumentDetailContent } from './ArgumentDetailContent';
import { TopicClassificationToolbar } from './TopicClassificationToolbar';
import type { EwmsTopicNode } from '../data/ewms.nodes';
import {
  EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED,
  getEwmsSubtopicIdForArgument,
  getEwmsTopicIdForArgument,
  isEwmsArgumentApproved,
  isEwmsArgumentTopicReviewOpen,
  normalizeEwmsArgumentStatus,
  resolveEwmsReferenceId,
} from '../data/ewms.nodes';
import { useEwmsSubtopics } from '../workspace/EwmsSubtopicsContext';

type ArgumentDetailViewProps = {
  argumentRef: NodeRefByType<'argument'>;
  topics: EwmsTopicNode[];
  onBack: () => void;
};

const DETAIL_FIELD_AUTOSAVE_DELAY_MS = 2000;

type ArgumentDraftValues = {
  argumentText: string;
  classification: string;
  context: string;
};

const normalizeContextDraft = (value: string) => (value.trim() ? value : null);

/**
 * Coordinates argument detail editing, topic review, approval state, and debounced field persistence.
 */
export const ArgumentDetailView = (props: ArgumentDetailViewProps) => {
  const { argumentRef, topics, onBack } = props;
  const { data: argument } = useNode(argumentRef);
  const { transact, update } = useAction();
  const { trackPersistenceForNodeSummaryRefetch } = useEwmsSubtopics();
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const hasTopicMutationRights = useHasTopicMutationRights();

  const [argumentDraft, setArgumentDraft] = useControllableState(
    argument?.text ?? '',
  );
  const [contextDraft, setContextDraft] = useControllableState(
    argument?.context ?? '',
  );
  const [classificationDraft, setClassificationDraft] = useControllableState(
    argument?.einordnung ?? '',
  );
  const autosaveTimerRef = useRef<number | null>(null);
  const persistedArgumentText = argument?.text ?? '';
  const persistedContext = normalizeContextDraft(argument?.context ?? '');
  const persistedClassification = argument?.einordnung ?? '';
  const canMutateArgument =
    // eslint-disable-next-line no-restricted-syntax -- draft commit handlers and delayed autosave need one current permission predicate.
    useCallback(
      (targetTopicId?: string) => {
        if (
          !argument ||
          !canMutateProject ||
          (argument.topic_id && !hasTopicMutationRights(argument.topic_id))
        ) {
          return false;
        }

        return !targetTopicId || hasTopicMutationRights(targetTopicId);
      },
      [argument, canMutateProject, hasTopicMutationRights],
    );

  const saveDrafts =
    // eslint-disable-next-line no-restricted-syntax -- delayed autosave and immediate commit paths share this current draft persistence routine.
    useCallback(
      (values: ArgumentDraftValues) => {
        if (!argument || !canMutateArgument()) {
          return;
        }

        const nextContext = normalizeContextDraft(values.context);
        const shouldUpdateArgumentText =
          values.argumentText !== (argument.text ?? '');
        const shouldUpdateContext =
          nextContext !== normalizeContextDraft(argument.context ?? '');
        const shouldUpdateClassification =
          values.classification !== (argument.einordnung ?? '');

        if (
          !shouldUpdateArgumentText &&
          !shouldUpdateContext &&
          !shouldUpdateClassification
        ) {
          return;
        }

        transact(() => {
          update(argument, (draft) => {
            if (shouldUpdateArgumentText) {
              draft.text = values.argumentText;
            }
            if (shouldUpdateContext) {
              draft.context = nextContext;
            }
            if (shouldUpdateClassification) {
              draft.einordnung = values.classification;
            }
          });
        });
      },
      [argument, canMutateArgument, transact, update],
    );

  // eslint-disable-next-line no-restricted-syntax -- Autosave needs a timer that is cleaned up when the draft changes or the persisted value catches up.
  useEffect(() => {
    if (
      !argument ||
      (argumentDraft === persistedArgumentText &&
        normalizeContextDraft(contextDraft) === persistedContext &&
        classificationDraft === persistedClassification)
    ) {
      return;
    }

    const timerId = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      saveDrafts({
        argumentText: argumentDraft,
        classification: classificationDraft,
        context: contextDraft,
      });
    }, DETAIL_FIELD_AUTOSAVE_DELAY_MS);
    autosaveTimerRef.current = timerId;

    return () => {
      window.clearTimeout(timerId);
      if (autosaveTimerRef.current === timerId) {
        autosaveTimerRef.current = null;
      }
    };
  }, [
    argument,
    argumentDraft,
    classificationDraft,
    contextDraft,
    persistedArgumentText,
    persistedClassification,
    persistedContext,
    saveDrafts,
  ]);

  if (!argument) {
    return null;
  }

  const topicId = getEwmsTopicIdForArgument(argument) ?? '';
  const subtopicId = getEwmsSubtopicIdForArgument(argument) ?? '';
  const isApproved = isEwmsArgumentApproved(argument);
  const isTopicReviewOpen = isEwmsArgumentTopicReviewOpen(argument);
  const referenceId = resolveEwmsReferenceId(argument);
  const nextStatusAfterClassificationChange = isTopicReviewOpen
    ? EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED
    : normalizeEwmsArgumentStatus(argument.status);

  const handleTopicIdChange = (nextTopicId: string) => {
    if (!canMutateArgument(nextTopicId || undefined)) {
      return;
    }

    const tx = transact(() => {
      update(argument, (draft) => {
        draft.topic_id = nextTopicId || null;
        draft.sub_topic_id = null;
        draft.status = nextStatusAfterClassificationChange;
      });
    });
    trackPersistenceForNodeSummaryRefetch(tx.isPersisted.promise);
  };

  const handleSubtopicIdChange = (nextSubtopicId: string) => {
    if (!canMutateArgument()) {
      return;
    }

    const tx = transact(() => {
      update(argument, (draft) => {
        draft.sub_topic_id = nextSubtopicId || null;
        draft.status = nextStatusAfterClassificationChange;
      });
    });
    trackPersistenceForNodeSummaryRefetch(tx.isPersisted.promise);
  };

  const handleReviewClassification = (isAccepted: boolean) => {
    if (!canMutateArgument()) {
      return;
    }

    const tx = transact(() => {
      update(argument, (draft) => {
        draft.status = EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED;
        if (!isAccepted) {
          draft.topic_id = null;
          draft.sub_topic_id = null;
        }
      });
    });
    if (!isAccepted) {
      trackPersistenceForNodeSummaryRefetch(tx.isPersisted.promise);
    }
  };

  const handleToggleApproval = () => {
    if (!canMutateArgument()) {
      return;
    }

    transact(() => {
      update(argument, (draft) => {
        draft.status = isApproved
          ? EWMS_ARGUMENT_STATUS_SUBTOPIC_REVIEWED
          : 'done';
      });
    });
  };

  const handleClassificationDraftCommit = (value: string) => {
    if (!canMutateArgument()) {
      return;
    }

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    saveDrafts({
      argumentText: argumentDraft,
      classification: value,
      context: contextDraft,
    });
  };

  const handleArgumentDraftCommit = (value: string) => {
    if (!canMutateArgument()) {
      return;
    }

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    saveDrafts({
      argumentText: value,
      classification: classificationDraft,
      context: contextDraft,
    });
  };

  const handleContextDraftCommit = (value: string) => {
    if (!canMutateArgument()) {
      return;
    }

    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    saveDrafts({
      argumentText: argumentDraft,
      classification: classificationDraft,
      context: value,
    });
  };

  return (
    <div className="flex h-full w-full flex-col gap-0">
      <TopicClassificationToolbar
        referenceId={referenceId}
        argumentStatus={argument.status}
        topics={topics}
        topicId={topicId}
        subtopicId={subtopicId}
        isTopicReviewOpen={isTopicReviewOpen}
        isApproved={isApproved}
        onBack={onBack}
        onTopicIdChange={handleTopicIdChange}
        onSubtopicIdChange={handleSubtopicIdChange}
        onAcceptClassification={() => handleReviewClassification(true)}
        onRejectClassification={() => handleReviewClassification(false)}
        onToggleApproval={handleToggleApproval}
      />
      <ArgumentDetailContent
        argument={argument}
        argumentDraft={argumentDraft}
        contextDraft={contextDraft}
        classificationDraft={classificationDraft}
        onArgumentDraftChange={setArgumentDraft}
        onArgumentDraftCommit={handleArgumentDraftCommit}
        onContextDraftChange={setContextDraft}
        onContextDraftCommit={handleContextDraftCommit}
        onClassificationDraftChange={setClassificationDraft}
        onClassificationDraftCommit={handleClassificationDraftCommit}
      />
    </div>
  );
};
