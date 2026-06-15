import { z } from 'zod';
import {
  getFeedbackReasonsForRating,
  NEGATIVE_FEEDBACK_REASONS,
  POSITIVE_FEEDBACK_REASONS,
} from './feedbackOptions';

export const FEEDBACK_TEXT_MAX_LENGTH = 500;
export const FEEDBACK_TEXT_MAX_LENGTH_ERROR_KEY =
  'FeedbackDialog.textMaxLength';

const FEEDBACK_REASONS = [
  ...POSITIVE_FEEDBACK_REASONS,
  ...NEGATIVE_FEEDBACK_REASONS,
] as const;

export const feedbackFormSchema = z
  .object({
    rating: z.enum(['positive', 'negative']),
    reason: z.enum(FEEDBACK_REASONS).nullable(),
    text: z.string().max(FEEDBACK_TEXT_MAX_LENGTH, {
      message: FEEDBACK_TEXT_MAX_LENGTH_ERROR_KEY,
    }),
  })
  .superRefine((value, context) => {
    if (value.reason === null) {
      context.addIssue({
        code: 'custom',
        message: 'Feedback reason is required',
        path: ['reason'],
      });
      return;
    }

    if (!getFeedbackReasonsForRating(value.rating).includes(value.reason)) {
      context.addIssue({
        code: 'custom',
        message: 'Reason does not match rating',
        path: ['reason'],
      });
    }
  });

export type FeedbackFormValues = z.infer<typeof feedbackFormSchema>;
