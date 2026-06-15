import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { InsertByType, NodeRefByType } from '@/db/nodes/types';
import type { FeedbackThumbRating } from '@/features/ui/feedback-thumb-buttons/FeedbackThumbButtons';
import type { FeedbackReason } from './feedbackOptions';

export const FEEDBACK_TARGET_TYPES = [
  'fundstelle',
  'bewertung',
  'bewertung_quelle',
] as const;

export type FeedbackTargetType = (typeof FEEDBACK_TARGET_TYPES)[number];
export type FeedbackTargetRef = NodeRefByType<FeedbackTargetType>;
type FeedbackInsertPayload = InsertByType<'feedback'>['payload'];

export const createFeedbackPayload = (params: {
  feedbackId: string;
  rating: Exclude<FeedbackThumbRating, null>;
  reason?: FeedbackReason | null;
  targetRef: FeedbackTargetRef;
  text?: string | null;
  userId: string;
}): InsertByType<'feedback'> => {
  const { feedbackId, rating, reason, targetRef, text, userId } = params;
  const payload: FeedbackInsertPayload = {
    rating,
    reason: reason ?? null,
    text: text ?? null,
    user_id: userId,
    frontend_parent_ids: [toCompositeKey(targetRef)],
    update_type: 'manual',
  };

  return {
    node_type: 'feedback',
    id: feedbackId,
    payload,
  };
};
