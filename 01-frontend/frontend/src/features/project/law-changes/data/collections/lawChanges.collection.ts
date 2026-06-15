import { getPendingPendingUpdatesGet } from '@/api-clients/law-changes-module';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';
import {
  isDetailedLawChangesResponse,
  normalizeLawChangesResponse,
} from '../lawChanges.utils';

export const lawChangesQueryKey = ['law-changes'];

export const retryLawChangesRead = () => {
  void queryClient.invalidateQueries({ queryKey: lawChangesQueryKey });
};

export const lawChangesCollection = createCollection(
  queryCollectionOptions({
    id: 'law-changes',
    queryKey: lawChangesQueryKey,
    queryFn: async () => {
      const { data } = await getPendingPendingUpdatesGet({
        query: {
          detail: true,
        },
      });

      if (!data) {
        throw new Error('Failed to fetch law changes');
      }

      if (!isDetailedLawChangesResponse(data)) {
        throw new Error('Failed to fetch detailed law changes');
      }

      return normalizeLawChangesResponse(data);
    },
    queryClient,
    getKey: (item) => item.id,
  }),
);
