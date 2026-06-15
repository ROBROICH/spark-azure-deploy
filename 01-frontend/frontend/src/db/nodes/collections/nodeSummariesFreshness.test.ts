import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installNodeSummariesBackgroundRefresh,
  NODE_SUMMARIES_REFRESH_INTERVAL_MS,
  startNodeSummariesBackgroundRefresh,
} from './nodeSummariesFreshness';

const setDocumentVisibility = (visibilityState: DocumentVisibilityState) => {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: visibilityState,
  });
};

const createCollection = () => ({
  utils: {
    refetch: vi.fn(() => Promise.resolve()),
  },
});

type SubscriberChangeEvent = {
  previousSubscriberCount: number;
  subscriberCount: number;
};

const createSubscribableCollection = (subscriberCount = 0) => {
  let subscriberChangeCallback:
    | ((event: SubscriberChangeEvent) => void)
    | null = null;

  return {
    collection: {
      subscriberCount,
      on: vi.fn(
        (
          _event: 'subscribers:change',
          callback: (event: SubscriberChangeEvent) => void,
        ) => {
          subscriberChangeCallback = callback;
          return vi.fn();
        },
      ),
      utils: {
        refetch: vi.fn(() => Promise.resolve()),
      },
    },
    emitSubscriberChange: (event: SubscriberChangeEvent) => {
      subscriberChangeCallback?.(event);
    },
  };
};

describe('node summaries background refresh', () => {
  const stops: (() => void)[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
    setDocumentVisibility('visible');
  });

  afterEach(() => {
    stops.splice(0).forEach((stop) => {
      stop();
    });
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('polls node summaries every five minutes while the tab is visible', () => {
    const collection = createCollection();
    stops.push(startNodeSummariesBackgroundRefresh(collection));

    act(() => {
      vi.advanceTimersByTime(NODE_SUMMARIES_REFRESH_INTERVAL_MS);
    });

    expect(collection.utils.refetch).toHaveBeenCalledTimes(1);
  });

  it('does not poll node summaries while the tab is hidden', () => {
    const collection = createCollection();
    setDocumentVisibility('hidden');
    stops.push(startNodeSummariesBackgroundRefresh(collection));

    act(() => {
      vi.advanceTimersByTime(NODE_SUMMARIES_REFRESH_INTERVAL_MS);
    });

    expect(collection.utils.refetch).not.toHaveBeenCalled();
  });

  it('refetches node summaries when the tab receives focus again', () => {
    const collection = createCollection();
    stops.push(startNodeSummariesBackgroundRefresh(collection));

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(collection.utils.refetch).toHaveBeenCalledTimes(1);
  });

  it('restarts the polling cadence after a focus refetch', async () => {
    const collection = createCollection();
    stops.push(startNodeSummariesBackgroundRefresh(collection));

    await act(async () => {
      vi.advanceTimersByTime(NODE_SUMMARIES_REFRESH_INTERVAL_MS - 1000);
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      vi.advanceTimersByTime(1000);
    });

    expect(collection.utils.refetch).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(NODE_SUMMARIES_REFRESH_INTERVAL_MS - 1001);
    });

    expect(collection.utils.refetch).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(collection.utils.refetch).toHaveBeenCalledTimes(2);
  });

  it('dedupes focus refetches within the focus window', async () => {
    const collection = createCollection();
    stops.push(startNodeSummariesBackgroundRefresh(collection));

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(collection.utils.refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(999);
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(collection.utils.refetch).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
      window.dispatchEvent(new Event('focus'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(collection.utils.refetch).toHaveBeenCalledTimes(2);
  });

  it('refetches node summaries when the tab becomes visible again', () => {
    const collection = createCollection();
    setDocumentVisibility('hidden');
    stops.push(startNodeSummariesBackgroundRefresh(collection));

    setDocumentVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(collection.utils.refetch).toHaveBeenCalledTimes(1);
  });

  it('does not start duplicate refresh loops for the same collection', () => {
    const collection = createCollection();
    stops.push(startNodeSummariesBackgroundRefresh(collection));
    stops.push(startNodeSummariesBackgroundRefresh(collection));

    act(() => {
      vi.advanceTimersByTime(NODE_SUMMARIES_REFRESH_INTERVAL_MS);
    });

    expect(collection.utils.refetch).toHaveBeenCalledTimes(1);
  });

  it('starts polling when the summaries collection gains subscribers', () => {
    const { collection, emitSubscriberChange } = createSubscribableCollection();
    stops.push(installNodeSummariesBackgroundRefresh(collection));

    act(() => {
      vi.advanceTimersByTime(NODE_SUMMARIES_REFRESH_INTERVAL_MS);
    });
    expect(collection.utils.refetch).not.toHaveBeenCalled();

    emitSubscriberChange({
      previousSubscriberCount: 0,
      subscriberCount: 1,
    });
    act(() => {
      vi.advanceTimersByTime(NODE_SUMMARIES_REFRESH_INTERVAL_MS);
    });

    expect(collection.utils.refetch).toHaveBeenCalledTimes(1);
  });

  it('stops polling when the summaries collection loses all subscribers', () => {
    const { collection, emitSubscriberChange } =
      createSubscribableCollection(1);
    stops.push(installNodeSummariesBackgroundRefresh(collection));

    emitSubscriberChange({
      previousSubscriberCount: 1,
      subscriberCount: 0,
    });
    act(() => {
      vi.advanceTimersByTime(NODE_SUMMARIES_REFRESH_INTERVAL_MS);
    });

    expect(collection.utils.refetch).not.toHaveBeenCalled();
  });
});
