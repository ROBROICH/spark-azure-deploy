import { eq, useLiveInfiniteQuery } from '@tanstack/react-db';

import {
  COMMENTS_PAGE_SIZE,
  commentsCollection,
} from '../collections/comments.collection';

export const useComments = (projectId: string) => {
  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useLiveInfiniteQuery(
    (q) =>
      q
        .from({ items: commentsCollection })
        .where(({ items }) => eq(items.projectId, projectId))
        .orderBy(({ items }) => items.createdAt, 'asc')
        .orderBy(({ items }) => items.id, 'asc'),
    { pageSize: COMMENTS_PAGE_SIZE },
    [projectId],
  );

  const refetchComments = () => commentsCollection.utils.refetch();

  return {
    comments: data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch: refetchComments,
  };
};
