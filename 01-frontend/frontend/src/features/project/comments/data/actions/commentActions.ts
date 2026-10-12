import { v1CommentDeleteComment } from '@/api-clients/backend';
import { commentsCollection } from '../collections/comments.collection';
import type {
  CommentItem,
  CommentProcessStep,
  CommentSource,
  CommentSourceRef,
} from '../schemas/comment.schema';

export const addComment = async (
  projectId: string,
  title: string,
  content: string,
  processStep: CommentProcessStep,
  sourceRef?: CommentSourceRef,
  source?: CommentSource,
) => {
  const timestamp = new Date();
  const item: CommentItem = {
    id: crypto.randomUUID(),
    projectId,
    title,
    content,
    createdAt: timestamp,
    updatedAt: timestamp,
    processStep,
    sourceRef: sourceRef ?? (source ? { type: source } : undefined),
  };

  // Comments receive their authoritative id from the backend, so avoid showing
  // the temporary local id as a separate optimistic row before refetch.
  const tx = commentsCollection.insert(item, { optimistic: false });
  await tx.isPersisted.promise;
};

export const editComment = async (
  id: string,
  title: string,
  content: string,
) => {
  const tx = commentsCollection.update(id, (draft) => {
    draft.title = title;
    draft.content = content;
    draft.updatedAt = new Date();
  });
  await tx.isPersisted.promise;
};

export const removeComment = async (projectId: string, commentId: string) => {
  await v1CommentDeleteComment({
    path: { projectId, commentId },
    throwOnError: true,
  });
  await commentsCollection.utils.refetch();
};
