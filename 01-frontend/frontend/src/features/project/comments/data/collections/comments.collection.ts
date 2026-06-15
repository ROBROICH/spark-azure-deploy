import {
  createCommentProjectsProjectIdCommentsPost,
  deleteCommentProjectsProjectIdCommentsCommentIdDelete,
  getCommentsProjectsProjectIdCommentsGet,
  updateCommentProjectsProjectIdCommentsCommentIdPatch,
  type CommentResponse,
  type CreateCommentRequest,
  type SourceRef,
  type UpdateCommentRequest,
} from '@/api-clients/comments-module';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';

import {
  getProjectIdFromCollectionOptions,
  getProjectScopedCollectionQueryKey,
} from '@/features/project/data/collections/projectScopedCollection';
import type { CommentItem, CommentSourceRef } from '../schemas/comment.schema';

const fromApiSourceRef = (
  sourceRef?: SourceRef | null,
): CommentSourceRef | undefined => {
  if (!sourceRef) {
    return undefined;
  }
  return {
    type: sourceRef.type,
    itemId: sourceRef.item_id ?? undefined,
  };
};

const toApiSourceRef = (
  sourceRef?: CommentSourceRef,
): SourceRef | undefined => {
  if (!sourceRef) {
    return undefined;
  }
  return {
    type: sourceRef.type,
    item_id: sourceRef.itemId,
  };
};

const commentFromApi = (item: CommentResponse): CommentItem => ({
  id: item.id,
  projectId: item.project_id,
  title: item.title,
  content: item.content,
  createdAt: new Date(item.created_at),
  updatedAt: new Date(item.updated_at),
  processStep: item.process_step,
  sourceRef: fromApiSourceRef(item.source_ref),
});

const commentToCreatePayload = (item: CommentItem): CreateCommentRequest => ({
  title: item.title,
  content: item.content,
  process_step: item.processStep,
  source_ref: toApiSourceRef(item.sourceRef),
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
    payload.process_step = changes.processStep;
  }
  if ('sourceRef' in changes) {
    payload.source_ref = toApiSourceRef(changes.sourceRef) ?? null;
  }

  return payload;
};

export const commentsCollection = createCollection(
  queryCollectionOptions({
    id: 'project-comments',
    syncMode: 'on-demand',
    queryKey: (opts) =>
      getProjectScopedCollectionQueryKey('project-comments', opts),
    queryFn: async (ctx): Promise<CommentItem[]> => {
      const projectId = getProjectIdFromCollectionOptions(
        ctx.meta?.loadSubsetOptions as Record<string, unknown>,
      );
      if (!projectId) {
        return [];
      }

      const { data } = await getCommentsProjectsProjectIdCommentsGet({
        path: { project_id: projectId },
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
          const { data } = await createCommentProjectsProjectIdCommentsPost({
            path: { project_id: mutation.modified.projectId },
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

          const { data } =
            await updateCommentProjectsProjectIdCommentsCommentIdPatch({
              path: {
                project_id: mutation.original.projectId,
                comment_id: mutation.key,
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
          await deleteCommentProjectsProjectIdCommentsCommentIdDelete({
            path: {
              project_id: mutation.original.projectId,
              comment_id: mutation.key,
            },
          });
        }),
      );
    },
  }),
);
