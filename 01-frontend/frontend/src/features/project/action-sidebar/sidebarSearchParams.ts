import { z } from 'zod';
import {
  commentProcessStepSchema,
  commentSourceRefSchema,
  commentSourceSchema,
} from '@/features/project/comments/data/schemas/comment.schema';
import { requestItemSourceRefSchema } from '@/features/project/nachforderungen/data/schemas/requestItem.schema';

const sidebarPanelSchema = z.enum([
  'protokollierung',
  'requestList',
  'comments',
  'legal-references',
  'ai-tools',
  'running-workflows',
]);

export type SidebarPanel = z.infer<typeof sidebarPanelSchema>;
export type RequestListInitItem = z.infer<typeof requestListInitItemSchema>;
export type CommentInitItem = z.infer<typeof commentInitItemSchema>;

const requestListInitItemSchema = z.object({
  title: z.string(),
  sourceRef: requestItemSourceRefSchema.optional(),
  documentId: z.string().optional(),
  topicId: z.string().optional(),
});

const commentInitItemSchema = z.object({
  title: z.string(),
  content: z.string().optional(),
  sourceRef: commentSourceRefSchema.optional(),
  source: commentSourceSchema.optional(),
  processStep: commentProcessStepSchema.optional(),
});

/**
 * Drops malformed entries from a transient init-item array instead of voiding
 * the whole array, so one bad entry in a stale URL does not discard the rest.
 * The outer `.catch(undefined)` is the final safety net if the value is not an
 * array at all.
 */
const transientInitItemArray = <TItem extends z.ZodTypeAny>(
  itemSchema: TItem,
) =>
  z
    .array(itemSchema.optional().catch(undefined))
    .transform((items): z.infer<TItem>[] =>
      items.filter((item): item is z.infer<TItem> => item !== undefined),
    )
    .optional()
    .catch(undefined);

export const actionSidebarSearchSchema = z.object({
  // Every transient/optional field below canonicalizes a stale or garbage value
  // to `undefined` via `.catch(undefined)` so a bad URL never throws and trips
  // the project route error fallback.
  sidebarPanel: sidebarPanelSchema.optional().catch(undefined),
  newRequestListInitItems: transientInitItemArray(requestListInitItemSchema),
  newCommentInitItems: transientInitItemArray(commentInitItemSchema),
  deleteRequestItemId: z.string().optional().catch(undefined),
  deleteCommentId: z.string().optional().catch(undefined),
  protocolTimePeriods: z
    .enum(['0', '1', '7', '30', '180', '365', 'over-365'])
    .optional()
    .catch(undefined),
  protocolSource: z.enum(['user', 'agent', 'all']).optional().catch(undefined),
  protocolService: z.string().optional().catch(undefined),
  protocolWorkflowRunId: z.string().optional().catch(undefined),
  protocolRequestId: z.string().optional().catch(undefined),
  protocolOffset: z.number().int().nonnegative().optional().catch(undefined),
  protocolDrilldownOffset: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .catch(undefined),
});

export type ActionSidebarSearch = z.infer<typeof actionSidebarSearchSchema>;

export const requestSidebarSearchUpdate = (
  request: RequestListInitItem | string,
) => ({
  sidebarPanel: 'requestList' as const,
  newRequestListInitItems: [
    typeof request === 'string' ? { title: request } : request,
  ],
});

export const commentSidebarSearchUpdate = (
  comment: CommentInitItem | string,
) => ({
  sidebarPanel: 'comments' as const,
  newCommentInitItems: [
    typeof comment === 'string' ? { title: comment } : comment,
  ],
});
