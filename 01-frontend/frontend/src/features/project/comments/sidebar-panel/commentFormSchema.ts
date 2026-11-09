import { z } from 'zod';

const COMMENT_TITLE_MAX_LENGTH = 255;
const COMMENT_CONTENT_MAX_LENGTH = 2000;

/**
 * Shortens a prefilled title from a source name so the form opens valid.
 *
 * @param title Source name used as the comment title draft.
 * @returns The title, cut to the title limit with a trailing ellipsis when longer.
 */
export const toCommentTitleDraft = (title: string) => {
  if (title.length <= COMMENT_TITLE_MAX_LENGTH) {
    return title;
  }
  let end = COMMENT_TITLE_MAX_LENGTH - 1;
  // The limit counts UTF-16 units; never cut between the two halves of a surrogate pair.
  const lastCode = title.charCodeAt(end - 1);
  if (lastCode >= 0xd800 && lastCode <= 0xdbff) {
    end -= 1;
  }
  return `${title.slice(0, end)}…`;
};

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
