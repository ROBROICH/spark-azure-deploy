import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNodeSummaryRefetchOnTrackedPersistence } from './useNodeSummaryRefetchOnTrackedPersistence';

type DeferredPromise = {
  promise: Promise<unknown>;
  reject: (error: unknown) => void;
  resolve: () => void;
};

const mocks = vi.hoisted(() => ({
  refetchNodeSummaries: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useLoaderData: () => ({
      refetchNodeSummaries: mocks.refetchNodeSummaries,
    }),
  }),
}));

const createDeferredPromise = (): DeferredPromise => {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<unknown>((promiseResolve, promiseReject) => {
    resolve = () => promiseResolve(undefined);
    reject = promiseReject;
  });

  return { promise, reject, resolve };
};

describe('useNodeSummaryRefetchOnTrackedPersistence', () => {
  beforeEach(() => {
    mocks.refetchNodeSummaries.mockReset();
    mocks.refetchNodeSummaries.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not refetch when no persistence promises were tracked', async () => {
    const { unmount } = renderHook(() =>
      useNodeSummaryRefetchOnTrackedPersistence(),
    );

    unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.refetchNodeSummaries).not.toHaveBeenCalled();
  });

  it('does not refetch before the owner unmounts', async () => {
    const { result } = renderHook(() =>
      useNodeSummaryRefetchOnTrackedPersistence(),
    );

    result.current.trackPersistenceForNodeSummaryRefetch(Promise.resolve());

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.refetchNodeSummaries).not.toHaveBeenCalled();
  });

  it('does not refetch when the owner rerenders', async () => {
    const { rerender, result, unmount } = renderHook(() =>
      useNodeSummaryRefetchOnTrackedPersistence(),
    );

    result.current.trackPersistenceForNodeSummaryRefetch(Promise.resolve());

    await act(async () => {
      await Promise.resolve();
    });
    rerender();
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.refetchNodeSummaries).not.toHaveBeenCalled();

    unmount();

    await waitFor(() =>
      expect(mocks.refetchNodeSummaries).toHaveBeenCalledOnce(),
    );
  });

  it('keeps the tracking callback stable across rerenders', () => {
    const { rerender, result } = renderHook(() =>
      useNodeSummaryRefetchOnTrackedPersistence(),
    );

    const trackPersistenceForNodeSummaryRefetch =
      result.current.trackPersistenceForNodeSummaryRefetch;

    rerender();

    expect(result.current.trackPersistenceForNodeSummaryRefetch).toBe(
      trackPersistenceForNodeSummaryRefetch,
    );
  });

  it('refetches once on unmount after a tracked persistence promise fulfilled', async () => {
    const { result, unmount } = renderHook(() =>
      useNodeSummaryRefetchOnTrackedPersistence(),
    );

    result.current.trackPersistenceForNodeSummaryRefetch(Promise.resolve());
    unmount();

    await waitFor(() =>
      expect(mocks.refetchNodeSummaries).toHaveBeenCalledOnce(),
    );
  });

  it('waits for pending persistence before refetching on unmount', async () => {
    const deferredPersistence = createDeferredPromise();
    const { result, unmount } = renderHook(() =>
      useNodeSummaryRefetchOnTrackedPersistence(),
    );

    result.current.trackPersistenceForNodeSummaryRefetch(
      deferredPersistence.promise,
    );
    unmount();

    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.refetchNodeSummaries).not.toHaveBeenCalled();

    deferredPersistence.resolve();

    await waitFor(() =>
      expect(mocks.refetchNodeSummaries).toHaveBeenCalledOnce(),
    );
  });

  it('does not refetch when all tracked persistence promises reject', async () => {
    const deferredPersistence = createDeferredPromise();
    const { result, unmount } = renderHook(() =>
      useNodeSummaryRefetchOnTrackedPersistence(),
    );

    result.current.trackPersistenceForNodeSummaryRefetch(
      deferredPersistence.promise,
    );
    unmount();
    deferredPersistence.reject(new Error('persist failed'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.refetchNodeSummaries).not.toHaveBeenCalled();
  });

  it('coalesces multiple fulfilled persistence promises into one refetch', async () => {
    const { result, unmount } = renderHook(() =>
      useNodeSummaryRefetchOnTrackedPersistence(),
    );

    result.current.trackPersistenceForNodeSummaryRefetch(Promise.resolve());
    result.current.trackPersistenceForNodeSummaryRefetch(Promise.resolve());
    unmount();

    await waitFor(() =>
      expect(mocks.refetchNodeSummaries).toHaveBeenCalledOnce(),
    );
  });

  it('swallows refetch errors after a fulfilled persistence promise', async () => {
    mocks.refetchNodeSummaries.mockRejectedValueOnce(
      new Error('refetch failed'),
    );
    const { result, unmount } = renderHook(() =>
      useNodeSummaryRefetchOnTrackedPersistence(),
    );

    result.current.trackPersistenceForNodeSummaryRefetch(Promise.resolve());
    unmount();

    await waitFor(() =>
      expect(mocks.refetchNodeSummaries).toHaveBeenCalledOnce(),
    );
  });
});
