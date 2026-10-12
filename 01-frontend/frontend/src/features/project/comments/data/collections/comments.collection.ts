import {
  v1CommentCreateComment as createComment,
  v1CommentDeleteComment as deleteComment,
  v1CommentListComments as listComments,
  v1CommentUpdateComment as updateComment,
  type CommentResponse,
  type CreateCommentRequest,
  type SourceRef,
  type UpdateCommentRequest,
} from '@/api-clients/backend';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { BasicIndex, createCollection } from '@tanstack/react-db';

import { getProjectIdFromCollectionOptions } from '@/features/project/data/collections/projectScopedCollection';
import {
  commentSourceRefSchema,
  type CommentItem,
  type CommentSourceRef,
} from '../schemas/comment.schema';

export const COMMENTS_PAGE_SIZE = 50;

const fromApiSourceRef = (
  sourceRef?: SourceRef | null,
): CommentSourceRef | undefined => {
  if (!sourceRef) {
    return undefined;
  }
  const parsed = commentSourceRefSchema.safeParse({
    type: sourceRef.type,
    itemId: sourceRef.itemId ?? undefined,
  });
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data;
};

const toApiSourceRef = (
  sourceRef?: CommentSourceRef,
): SourceRef | undefined => {
  if (!sourceRef) {
    return undefined;
  }
  if (sourceRef.type === 'manual') {
    return { type: 'manual', itemId: sourceRef.itemId ?? null };
  }
  if (!sourceRef.itemId) {
    return undefined;
  }
  return { type: sourceRef.type, itemId: sourceRef.itemId };
};

const parseCommentDate = (value: CommentResponse['createdAt']) => {
  if (
    value instanceof Date ||
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return new Date(value);
  }

  throw new TypeError('Comment response contains an invalid date.');
};

const commentFromApi = (item: CommentResponse): CommentItem => ({
  id: item.id,
  projectId: item.projectId,
  title: item.title,
  content: item.content,
  createdAt: parseCommentDate(item.createdAt),
  updatedAt: parseCommentDate(item.updatedAt),
  processStep: item.processStep,
  sourceRef: fromApiSourceRef(item.sourceRef),
});

const commentToCreatePayload = (item: CommentItem): CreateCommentRequest => ({
  title: item.title,
  content: item.content,
  processStep: item.processStep,
  sourceRef: toApiSourceRef(item.sourceRef),
});

const toPatchPayload = (
  changes: Partial<CommentItem>,
): UpdateCommentRequest => {
  const payload: UpdateCommentRequest = {};

  if (typeof changes.title === 'string') {
    payload.title = changes.title;
  }
  if (typeof changes.content === 'string') {
    payload.content = changes.content;
  }
  if (typeof changes.processStep === 'string') {
    payload.processStep = changes.processStep;
  }
  if ('sourceRef' in changes) {
    payload.sourceRef = toApiSourceRef(changes.sourceRef) ?? null;
  }

  return payload;
};

export const commentsCollection = createCollection(
  queryCollectionOptions({
    id: 'project-comments',
    syncMode: 'on-demand',
    autoIndex: 'eager',
    defaultIndexType: BasicIndex,
    queryKey: ['project-comments'],
    queryFn: async (ctx): Promise<CommentItem[]> => {
      const projectId = getProjectIdFromCollectionOptions(
        ctx.meta?.loadSubsetOptions as Record<string, unknown>,
      );
      if (!projectId) {
        return [];
      }

      const { data } = await listComments({
        path: { projectId },
        query: {
          limit: ctx.meta?.loadSubsetOptions?.limit ?? COMMENTS_PAGE_SIZE,
          offset: ctx.meta?.loadSubsetOptions?.offset ?? 0,
        },
      });
      if (!data) {
        throw new Error('Failed to fetch comments');
      }
      return data.map(commentFromApi);
    },
    queryClient,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const results = await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const { data } = await createComment({
            path: { projectId: mutation.modified.projectId },
            body: commentToCreatePayload(mutation.modified),
          });

          if (!data) {
            throw new Error('Failed to create comment');
          }
          return commentFromApi(data);
        }),
      );

      return results;
    },
    onUpdate: async ({ transaction }) => {
      const results = await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const body = toPatchPayload(mutation.changes);
          if (Object.keys(body).length === 0) {
            return {
              ...mutation.original,
              ...mutation.changes,
            };
          }

          const { data } = await updateComment({
            path: {
              projectId: mutation.original.projectId,
              commentId: mutation.key,
            },
            body,
          });

          if (!data) {
            throw new Error('Failed to update comment');
          }
          return commentFromApi(data);
        }),
      );

      return results;
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          await deleteComment({
            path: {
              projectId: mutation.original.projectId,
              commentId: mutation.key,
            },
          });
        }),
      );
    },
  }),
);
