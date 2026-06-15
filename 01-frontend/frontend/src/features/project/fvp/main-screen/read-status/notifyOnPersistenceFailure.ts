import { toast } from '@/features/ui/toast/Toast';

type PersistenceTransaction = {
  isPersisted: { promise: Promise<unknown> };
};

/**
 * Surfaces a toast when an optimistic collection mutation fails to persist, so
 * a fire-and-forget write cannot silently leave stale optimistic state. The
 * optimistic change is rolled back by the collection on rejection; this only
 * adds the user-visible feedback.
 *
 * @param transaction Optimistic transaction returned by a collection mutation.
 * @param message Already-translated failure message to show in the toast.
 */
export const notifyOnPersistenceFailure = (
  transaction: PersistenceTransaction,
  message: string,
) => {
  void transaction.isPersisted.promise.catch(() => toast.error(message));
};
