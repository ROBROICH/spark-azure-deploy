import { eq, useLiveQuery } from '@tanstack/react-db';

import { commentsCollection } from '../collections/comments.collection';

export const useComments = (projectId: string) => {
  const { data, isLoading, isError } = useLiveQuery((q) =>
    q
      .from({ items: commentsCollection })
      .where(({ items }) => eq(items.projectId, projectId)),
  );

  // Sort by creation date (oldest first, newest at bottom)
  const sortedItems = [...data].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateA - dateB;
  });

  const refetchComments = () => commentsCollection.utils.refetch();

  return {
    comments: sortedItems,
    isLoading,
    isError,
    refetch: refetchComments,
  };
};
