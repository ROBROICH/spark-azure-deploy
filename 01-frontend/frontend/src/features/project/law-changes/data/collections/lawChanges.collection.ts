import { getPendingPendingUpdatesGet } from '@/api-clients/law-changes-module';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';
import { useSyncExternalStore } from 'react';
import {
  isDetailedLawChangesResponse,
  normalizeLawChangesResponse,
} from '../lawChanges.utils';

export const lawChangesQueryKey = ['law-changes'];

const LAW_CHANGES_MAX_RETRIES = 2;
const LAW_CHANGES_MAX_RETRY_DELAY_MS = 30_000;

const SERVICE_UNAVAILABLE_STATUSES = new Set([502, 503, 504]);

const createUnavailabilityStore = () => {
  const listeners = new Set<() => void>();
  let unavailable = false;

  return {
    getSnapshot: () => unavailable,
    set: (nextUnavailable: boolean) => {
      if (unavailable === nextUnavailable) {
        return;
      }

      unavailable = nextUnavailable;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

const unavailabilityStore = createUnavailabilityStore();

export const useLawChangesServiceUnavailable = () =>
  useSyncExternalStore(
    unavailabilityStore.subscribe,
    unavailabilityStore.getSnapshot,
    unavailabilityStore.getSnapshot,
  );

export const retryLawChangesRead = () => {
  void queryClient.invalidateQueries({ queryKey: lawChangesQueryKey });
};

const fetchLawChanges = async () => {
  const { data, response } = await getPendingPendingUpdatesGet({
    query: {
      detail: true,
    },
  });

  const status = response?.status;

  if (!data) {
    if (status === 404) {
      unavailabilityStore.set(false);
      return [];
    }
    if (status === undefined || SERVICE_UNAVAILABLE_STATUSES.has(status)) {
      unavailabilityStore.set(true);
    }

    throw new Error('Failed to fetch law changes');
  }

  if (!isDetailedLawChangesResponse(data)) {
    throw new Error('Failed to fetch detailed law changes');
  }

  unavailabilityStore.set(false);

  return normalizeLawChangesResponse(data);
};

export const lawChangesCollection = createCollection(
  queryCollectionOptions({
    id: 'law-changes',
    queryKey: lawChangesQueryKey,
    queryFn: fetchLawChanges,
    retry: LAW_CHANGES_MAX_RETRIES,
    retryDelay: (attempt: number) =>
      Math.min(1_000 * 2 ** attempt, LAW_CHANGES_MAX_RETRY_DELAY_MS),
    queryClient,
    getKey: (item) => item.id,
  }),
);
