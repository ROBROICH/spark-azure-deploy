import { useGraph } from '@/db/nodes/hooks/useGraph';
import { FeedbackNodeDialog } from '@/features/feedback/FeedbackNodeDialog';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect } from 'react';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

/**
 * Mounts the feedback dialog and keeps route-backed target parameters valid
 * against the current graph before passing them to the feedback node flow.
 *
 * @returns The MVP feedback dialog bound to the active route search state.
 */
export function MvpFeedbackDialogMount() {
  const { getNodesByType } = useGraph();
  const feedbackSearch = route.useSearch({
    select: (search) => ({
      rating: search.feedbackRating,
      targetId: search.feedbackTargetId,
      targetType: search.feedbackTargetType,
    }),
  });
  const navigate = route.useNavigate();
  const targetId = feedbackSearch.targetId;
  const isValidFeedbackTarget =
    typeof targetId === 'string' &&
    feedbackSearch.targetType === 'fundstelle' &&
    getNodesByType('fundstelle').some(
      (fundstelle) => fundstelle.id === targetId,
    );
  const targetRef =
    typeof targetId === 'string' && isValidFeedbackTarget
      ? {
          id: targetId,
          nodeType: 'fundstelle' as const,
        }
      : undefined;
  const hasTargetSearchParams =
    feedbackSearch.targetId !== undefined ||
    feedbackSearch.targetType !== undefined;

  // eslint-disable-next-line no-restricted-syntax -- invalid route-backed feedback targets must be canonicalized after graph validation resolves.
  useEffect(() => {
    if (!hasTargetSearchParams || isValidFeedbackTarget) {
      return;
    }

    void navigate({
      search: (prev) => ({
        ...prev,
        feedbackTargetId: undefined,
        feedbackTargetType: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  }, [hasTargetSearchParams, isValidFeedbackTarget, navigate]);

  const initialRating =
    hasTargetSearchParams && !isValidFeedbackTarget
      ? undefined
      : feedbackSearch.rating;

  return (
    <FeedbackNodeDialog
      initialRating={initialRating}
      namespace="MvpRedesign"
      targetRef={targetRef}
      onClose={() => {
        void navigate({
          search: (prev) => ({
            ...prev,
            feedbackRating: undefined,
            feedbackTargetId: undefined,
            feedbackTargetType: undefined,
          }),
          replace: true,
          resetScroll: false,
        });
      }}
    />
  );
}
