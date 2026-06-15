import {
  FeedbackThumbButtons,
  type FeedbackThumbRating,
} from '@/features/ui/feedback-thumb-buttons/FeedbackThumbButtons';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { FeedbackTargetRef } from './feedbackTarget';
import { useFeedbackForTarget } from './FeedbackLookupProvider';

export function NodeFeedbackThumbButtons(props: {
  targetRef: FeedbackTargetRef;
}) {
  const { targetRef } = props;
  const { t } = useTranslation('FeedbackDialog');
  const navigate = useNavigate();
  const { feedback, feedbackRef } = useFeedbackForTarget(targetRef);
  const rating = feedback?.rating ?? null;

  const openFeedbackDialog = (
    nextRating: Exclude<FeedbackThumbRating, null> | undefined,
  ) => {
    void navigate({
      // @ts-expect-error -- Shared feedback buttons are mounted under MVP and RPB routes, both of which validate the feedback search params.
      search: (prev) => ({
        ...prev,
        feedbackRating: nextRating,
        feedbackTargetId: targetRef.id,
        feedbackTargetType: targetRef.node_type,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const handleRate = (nextRating: FeedbackThumbRating) => {
    if (nextRating === null) {
      return;
    }

    openFeedbackDialog(feedbackRef ? undefined : nextRating);
  };

  return (
    <FeedbackThumbButtons
      rating={rating}
      thumbsUpAriaLabel={t('NodeFeedbackThumbButtons.thumbsUpAriaLabel')}
      thumbsDownAriaLabel={t('NodeFeedbackThumbButtons.thumbsDownAriaLabel')}
      onRate={handleRate}
    />
  );
}
