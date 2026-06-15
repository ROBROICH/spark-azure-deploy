import { z } from 'zod';

const COMMENT_TITLE_MAX_LENGTH = 255;
const COMMENT_CONTENT_MAX_LENGTH = 2000;

const COMMENT_PROCESS_STEP_VALUES = [
  'unsorted',
  'formalCompletenessCheck',
  'plausibilityCheck',
  'materialCompletenessCheck',
  'legalReview',
] as const;

export const createCommentFormSchema = (messages: {
  titleRequired: string;
  titleMaxLength: string;
  contentRequired: string;
  contentMaxLength: string;
  processStepRequired: string;
}) =>
  z.object({
    processStep: z.enum(COMMENT_PROCESS_STEP_VALUES, {
      message: messages.processStepRequired,
    }),
    title: z
      .string()
      .trim()
      .min(1, messages.titleRequired)
      .max(COMMENT_TITLE_MAX_LENGTH, messages.titleMaxLength),
    content: z
      .string()
      .trim()
      .min(1, messages.contentRequired)
      .max(COMMENT_CONTENT_MAX_LENGTH, messages.contentMaxLength),
  });
