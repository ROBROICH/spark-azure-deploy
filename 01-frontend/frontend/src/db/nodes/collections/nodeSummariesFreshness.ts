export const NODE_SUMMARIES_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const FOCUS_REFETCH_DEDUPING_MS = 1000;

type RefetchableNodeSummariesCollection = {
  on?: (
    event: 'subscribers:change',
    callback: (event: {
      previousSubscriberCount: number;
      subscriberCount: number;
    }) => void,
  ) => () => void;
  subscriberCount?: number;
  utils?: {
    refetch?: () => Promise<unknown> | unknown;
  };
};

const activeRefreshes = new WeakMap<object, () => void>();
const installedRefreshManagers = new WeakMap<object, () => void>();

const canUseBrowserRefresh = () =>
  typeof window !== 'undefined' && typeof document !== 'undefined';

const isVisibleTab = () => document.visibilityState !== 'hidden';

const hasRefetch = (
  collection: RefetchableNodeSummariesCollection,
): collection is { utils: { refetch: () => Promise<unknown> | unknown } } =>
  typeof collection.utils?.refetch === 'function';

/**
 * Starts browser-level summary refetching for a node summaries collection.
 * This refreshes graph refs only; payload collections keep their existing
 * scoped, on-demand loading behavior.
 */
export const startNodeSummariesBackgroundRefresh = (
  collection: RefetchableNodeSummariesCollection,
) => {
  if (!canUseBrowserRefresh() || !hasRefetch(collection)) {
    return () => {};
  }

  const existingStop = activeRefreshes.get(collection);
  if (existingStop) {
    return existingStop;
  }

  let isRefetching = false;
  let lastRefetchStartedAt = 0;
  let intervalId: number | null = null;

  const refetchSummaries = (dedupeFocusEvents: boolean) => {
    if (!isVisibleTab() || isRefetching) {
      return;
    }

    const now = Date.now();
    if (
      dedupeFocusEvents &&
      now - lastRefetchStartedAt < FOCUS_REFETCH_DEDUPING_MS
    ) {
      return;
    }

    isRefetching = true;
    lastRefetchStartedAt = now;

    try {
      void Promise.resolve(collection.utils.refetch())
        .catch(() => undefined)
        .finally(() => {
          isRefetching = false;
        });
    } catch {
      isRefetching = false;
    }
  };

  const scheduleNextInterval = () => {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
    }

    intervalId = window.setInterval(() => {
      refetchSummaries(false);
    }, NODE_SUMMARIES_REFRESH_INTERVAL_MS);
  };

  const refetchOnFocus = () => {
    refetchSummaries(true);
    scheduleNextInterval();
  };

  scheduleNextInterval();

  window.addEventListener('focus', refetchOnFocus);
  document.addEventListener('visibilitychange', refetchOnFocus);

  const stop = () => {
    if (intervalId !== null) {
      window.clearInterval(intervalId);
    }
    window.removeEventListener('focus', refetchOnFocus);
    document.removeEventListener('visibilitychange', refetchOnFocus);
    activeRefreshes.delete(collection);
  };

  activeRefreshes.set(collection, stop);
  return stop;
};

/**
 * Installs active-subscriber lifecycle handling for summary freshness.
 * Cached collections stay idle until a route or live query subscribes to them.
 */
export const installNodeSummariesBackgroundRefresh = (
  collection: RefetchableNodeSummariesCollection,
) => {
  if (!canUseBrowserRefresh() || typeof collection.on !== 'function') {
    return () => {};
  }

  const existingStop = installedRefreshManagers.get(collection);
  if (existingStop) {
    return existingStop;
  }

  let stopRefresh = collection.subscriberCount
    ? startNodeSummariesBackgroundRefresh(collection)
    : null;

  const unsubscribe = collection.on('subscribers:change', (event) => {
    if (event.previousSubscriberCount === 0 && event.subscriberCount > 0) {
      stopRefresh = startNodeSummariesBackgroundRefresh(collection);
      return;
    }

    if (event.previousSubscriberCount > 0 && event.subscriberCount === 0) {
      stopRefresh?.();
      stopRefresh = null;
    }
  });

  const stop = () => {
    stopRefresh?.();
    unsubscribe();
    installedRefreshManagers.delete(collection);
  };

  installedRefreshManagers.set(collection, stop);
  return stop;
};
