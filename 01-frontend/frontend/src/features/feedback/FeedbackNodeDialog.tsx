import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useNode } from '@/db/nodes/hooks/useNodes';
import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import { useCurrentUser } from '@/features/access-control/current-user/CurrentUserProvider';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { toast } from '@/features/ui/toast/Toast';
import { useAction } from '@/db/nodes/hooks/useAction';
import * as Sentry from '@sentry/react';
import { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { FeedbackDialogFrame } from './FeedbackDialogFrame';
import { FeedbackForm } from './FeedbackForm';
import { FeedbackLoadingContent } from './FeedbackLoadingContent';
import type { FeedbackReason } from './feedbackOptions';
import {
  createFeedbackPayload,
  type FeedbackTargetRef,
} from './feedbackTarget';
import { getFeedbackRefsForTarget } from './useFeedbackLookup';

type FeedbackRef = NodeRefByType<'feedback'>;
type FeedbackInitialRating = NodePayloadByType<'feedback'>['rating'];

function ExistingFeedbackFormContent(props: {
  feedbackRef: FeedbackRef;
  initialRating: FeedbackInitialRating | undefined;
  namespace: string;
  onClose: () => void;
  targetRef: FeedbackTargetRef;
}) {
  const { feedbackRef, initialRating, namespace, onClose, targetRef } = props;
  const { data: feedback } = useNode(feedbackRef);
  const { userId } = useCurrentUser();
  const { transact, update, delete: deleteNode } = useAction();
  const { t } = useTranslation(namespace);

  if (feedback === null) {
    return (
      <CreateFeedbackFormContent
        initialRating={initialRating ?? 'positive'}
        namespace={namespace}
        onClose={onClose}
        targetRef={targetRef}
      />
    );
  }

  const handleSave = async (nextFeedback: {
    rating: NodePayloadByType<'feedback'>['rating'];
    reason: FeedbackReason | null;
    text: string | null;
  }) => {
    const tx = transact(() => {
      update(feedback, (draft) => {
        draft.rating = nextFeedback.rating;
        draft.reason = nextFeedback.reason;
        draft.text = nextFeedback.text;
        draft.user_id = userId;
      });
    });

    try {
      await tx.isPersisted.promise;
    } catch (error) {
      Sentry.captureException(error);
      toast.error(t('FeedbackDialog.errors.saveFailed'));
      throw error;
    }
  };

  const handleDelete = async () => {
    const tx = transact(() => {
      deleteNode(feedback);
    });

    try {
      await tx.isPersisted.promise;
    } catch (error) {
      Sentry.captureException(error);
      toast.error(t('FeedbackDialog.errors.deleteFailed'));
      throw error;
    }
  };

  return (
    <FeedbackForm
      key={feedback.id}
      namespace={namespace}
      initialRating={initialRating ?? feedback.rating}
      initialReason={feedback.reason}
      initialText={feedback.text}
      onClose={onClose}
      onDelete={handleDelete}
      onSave={handleSave}
    />
  );
}

function CreateFeedbackFormContent(props: {
  initialRating: FeedbackInitialRating;
  namespace: string;
  onClose: () => void;
  targetRef: FeedbackTargetRef;
}) {
  const { initialRating, namespace, onClose, targetRef } = props;
  const { userId } = useCurrentUser();
  const { transact, insert } = useAction();
  const { t } = useTranslation(namespace);

  const handleSave = async (nextFeedback: {
    rating: FeedbackInitialRating;
    reason: FeedbackReason | null;
    text: string | null;
  }) => {
    const feedbackId = crypto.randomUUID();

    const tx = transact(() => {
      insert(
        createFeedbackPayload({
          feedbackId,
          rating: nextFeedback.rating,
          reason: nextFeedback.reason,
          targetRef,
          text: nextFeedback.text,
          userId,
        }),
      );
    });

    try {
      await tx.isPersisted.promise;
    } catch (error) {
      Sentry.captureException(error);
      toast.error(t('FeedbackDialog.errors.saveFailed'));
      throw error;
    }
  };

  return (
    <FeedbackForm
      key={`${targetRef.node_type}:${targetRef.id}:new`}
      namespace={namespace}
      initialRating={initialRating}
      initialReason={null}
      initialText={null}
      onClose={onClose}
      onSave={handleSave}
    />
  );
}

function CreateFeedbackDialog(props: {
  initialRating: FeedbackInitialRating;
  namespace: string;
  onClose: () => void;
  targetRef: FeedbackTargetRef;
}) {
  const { initialRating, namespace, onClose, targetRef } = props;

  return (
    <FeedbackDialogFrame
      open
      namespace={namespace}
      descriptionKey="FeedbackDialog.ratingQuestion"
      onOpenChange={(open) => !open && onClose()}
    >
      <CreateFeedbackFormContent
        initialRating={initialRating}
        namespace={namespace}
        onClose={onClose}
        targetRef={targetRef}
      />
    </FeedbackDialogFrame>
  );
}

export function FeedbackNodeDialog(props: {
  initialRating: FeedbackInitialRating | undefined;
  namespace: string;
  onClose: () => void;
  targetRef: FeedbackTargetRef | undefined;
}) {
  const { initialRating, namespace, onClose, targetRef } = props;
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const { hasNode, index } = useGraph();
  const feedbackRef = targetRef
    ? (getFeedbackRefsForTarget(index, targetRef).at(0) ?? null)
    : null;

  // Fail closed: never open or insert feedback against a target that is not in
  // the current project graph, even if a route-backed target id slips through.
  if (!targetRef || !canMutateProject || !hasNode(targetRef.id)) {
    return null;
  }

  if (!feedbackRef) {
    if (!initialRating) {
      return null;
    }

    return (
      <CreateFeedbackDialog
        initialRating={initialRating}
        namespace={namespace}
        onClose={onClose}
        targetRef={targetRef}
      />
    );
  }

  return (
    <FeedbackDialogFrame
      open
      namespace={namespace}
      descriptionKey="FeedbackDialog.ratingQuestion"
      onOpenChange={(open) => !open && onClose()}
    >
      <Suspense fallback={<FeedbackLoadingContent namespace={namespace} />}>
        <ExistingFeedbackFormContent
          feedbackRef={feedbackRef}
          initialRating={initialRating}
          namespace={namespace}
          onClose={onClose}
          targetRef={targetRef}
        />
      </Suspense>
    </FeedbackDialogFrame>
  );
}
