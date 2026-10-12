import { useGraph } from '@/db/nodes/hooks/useGraph';
import { FeedbackNodeDialog } from '@/features/feedback/FeedbackNodeDialog';
import { getRouteApi } from '@tanstack/react-router';
import { useEffect } from 'react';
import { isRpbFeedbackTargetNodeType } from '../rpbFeedbackTarget';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

/**
 * Mounts the RPB feedback dialog and keeps route-backed target parameters valid
 * against the current graph before passing them to the feedback node flow.
 *
 * @returns The RPB feedback dialog bound to the active route search state.
 */
export function RpbFeedbackDialogMount() {
  const { hasNode } = useGraph();
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
    isRpbFeedbackTargetNodeType(feedbackSearch.targetType) &&
    hasNode(targetId);
  const targetRef =
    typeof targetId === 'string' &&
    isValidFeedbackTarget &&
    isRpbFeedbackTargetNodeType(feedbackSearch.targetType)
      ? {
          id: targetId,
          nodeType: feedbackSearch.targetType,
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
      namespace="Rpb"
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
