import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useEffect, useRef } from 'react';

const projectRoute = getRouteApi('/verfahren/$verfahrenId');

type TrackPersistenceForNodeSummaryRefetch = (
  promise: Promise<unknown>,
) => void;
type TrackedPersistenceState = {
  hasFulfilledPersistence: boolean;
  refetchNodeSummaries: () => unknown;
  pendingPersistencePromises: Set<Promise<void>>;
};

/**
 * Tracks persisted node writes and refetches node summaries once when the owner unmounts.
 */
export const useNodeSummaryRefetchOnTrackedPersistence = () => {
  const { refetchNodeSummaries } = projectRoute.useLoaderData();
  const trackedPersistenceStateRef = useRef<TrackedPersistenceState>({
    hasFulfilledPersistence: false,
    refetchNodeSummaries,
    pendingPersistencePromises: new Set(),
  });
  trackedPersistenceStateRef.current.refetchNodeSummaries =
    refetchNodeSummaries;

  const trackPersistenceForNodeSummaryRefetch =
    // eslint-disable-next-line no-restricted-syntax -- node persistence tracking is an event callback shared through context and must keep stable identity.
    useCallback<TrackPersistenceForNodeSummaryRefetch>((promise) => {
      const trackedPromise = Promise.resolve(promise).then(
        () => {
          trackedPersistenceStateRef.current.hasFulfilledPersistence = true;
        },
        () => undefined,
      );

      trackedPersistenceStateRef.current.pendingPersistencePromises.add(
        trackedPromise,
      );

      void trackedPromise.finally(() => {
        trackedPersistenceStateRef.current.pendingPersistencePromises.delete(
          trackedPromise,
        );
      });
    }, []);

  // eslint-disable-next-line no-restricted-syntax -- cleanup intentionally waits for tracked node persistence before one summary refetch after this owner unmounts.
  useEffect(() => {
    const trackedPersistenceState = trackedPersistenceStateRef.current;

    return () => {
      void (async () => {
        if (trackedPersistenceState.pendingPersistencePromises.size > 0) {
          await Promise.allSettled(
            trackedPersistenceState.pendingPersistencePromises,
          );
        }

        if (!trackedPersistenceState.hasFulfilledPersistence) {
          return;
        }

        await Promise.resolve(
          trackedPersistenceState.refetchNodeSummaries(),
        ).catch(() => undefined);
      })();
    };
  }, []);

  return {
    trackPersistenceForNodeSummaryRefetch,
  };
};
