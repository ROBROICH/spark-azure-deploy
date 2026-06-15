import { z } from 'zod';

/**
 * Process step where the comment was created.
 */
export const commentProcessStepSchema = z.enum([
  'formalCompletenessCheck',
  'plausibilityCheck',
  'materialCompletenessCheck',
  'legalReview',
  'unsorted',
]);

export type CommentProcessStep = z.infer<typeof commentProcessStepSchema>;

/**
 * Source category for comments created from MVP entities.
 */
export const commentSourceSchema = z.enum([
  'tableOfContents',
  'requiredDocuments',
  'contradiction',
  'materialLaw',
  'materialNorm',
  'materialSatz',
  'materialFundstelle',
  'manual',
]);

export type CommentSource = z.infer<typeof commentSourceSchema>;

export const commentSourceRefSchema = z.object({
  type: commentSourceSchema,
  itemId: z.string().optional(),
});

export type CommentSourceRef = z.infer<typeof commentSourceRefSchema>;

export const commentSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  content: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  processStep: commentProcessStepSchema,
  sourceRef: commentSourceRefSchema.optional(),
  source: commentSourceSchema.optional(),
});

export type CommentItem = z.infer<typeof commentSchema>;

type CommentSourceLike = {
  sourceRef?: CommentSourceRef;
  source?: CommentSource;
};

const getCommentSourceRef = (
  item: CommentSourceLike,
): CommentSourceRef | undefined => {
  if (item.sourceRef) {
    return item.sourceRef;
  }
  if (!item.source) {
    return undefined;
  }
  return {
    type: item.source,
  };
};

export const getCommentSourceType = (item: CommentSourceLike) =>
  getCommentSourceRef(item)?.type;
