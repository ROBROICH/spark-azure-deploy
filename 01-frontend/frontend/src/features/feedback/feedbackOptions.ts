import type { FeedbackRating as BackendFeedbackRating } from '@/api-clients/feedback-module';

export type FeedbackRating = BackendFeedbackRating;
export type FeedbackSelection = FeedbackRating | null;

export const POSITIVE_FEEDBACK_REASONS = [
  'RESULT_CORRECT',
  'RESULT_PARTIAL',
  'USEFUL_HINT',
  'ACCELERATES_WORK',
  'CONTENT_HELPFUL',
] as const;

export const NEGATIVE_FEEDBACK_REASONS = [
  'RESULT_NOT_CORRECT',
  'WRONG_CONTEXT',
  'QUESTION_MISMATCH',
  'TOO_GENERAL',
  'TOO_SPECIFIC',
] as const;

export type PositiveFeedbackReason = (typeof POSITIVE_FEEDBACK_REASONS)[number];
export type NegativeFeedbackReason = (typeof NEGATIVE_FEEDBACK_REASONS)[number];
export type FeedbackReason = PositiveFeedbackReason | NegativeFeedbackReason;

export const FEEDBACK_REASON_LABEL_KEYS = {
  RESULT_CORRECT: 'FeedbackDialog.reason.RESULT_CORRECT',
  RESULT_PARTIAL: 'FeedbackDialog.reason.RESULT_PARTIAL',
  USEFUL_HINT: 'FeedbackDialog.reason.USEFUL_HINT',
  ACCELERATES_WORK: 'FeedbackDialog.reason.ACCELERATES_WORK',
  CONTENT_HELPFUL: 'FeedbackDialog.reason.CONTENT_HELPFUL',
  RESULT_NOT_CORRECT: 'FeedbackDialog.reason.RESULT_NOT_CORRECT',
  WRONG_CONTEXT: 'FeedbackDialog.reason.WRONG_CONTEXT',
  QUESTION_MISMATCH: 'FeedbackDialog.reason.QUESTION_MISMATCH',
  TOO_GENERAL: 'FeedbackDialog.reason.TOO_GENERAL',
  TOO_SPECIFIC: 'FeedbackDialog.reason.TOO_SPECIFIC',
} satisfies Record<FeedbackReason, string>;

export const getFeedbackReasonsForRating = (
  rating: FeedbackSelection,
): ReadonlyArray<FeedbackReason> => {
  if (rating === 'positive') {
    return POSITIVE_FEEDBACK_REASONS;
  }

  if (rating === 'negative') {
    return NEGATIVE_FEEDBACK_REASONS;
  }

  return [];
};

export const isFeedbackReason = (
  value: string | null | undefined,
): value is FeedbackReason => {
  return (
    value !== null &&
    value !== undefined &&
    Object.hasOwn(FEEDBACK_REASON_LABEL_KEYS, value)
  );
};
