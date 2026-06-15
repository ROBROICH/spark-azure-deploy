import { eq, useLiveQuery } from '@tanstack/react-db';

import { requestItemsCollection } from '@/features/project/nachforderungen/data/collections/requestItems.collection';
import {
  getRequestItemSourceItemId,
  getRequestItemSourceType,
} from '@/features/project/nachforderungen/data/schemas/requestItem.schema';
import { contradictionsCollection } from './contradictions.collection';
import type { StoredContradiction } from './contradiction.schema';

export type PlausibilityContradictionListItem = StoredContradiction & {
  isOnRequestList: boolean;
};

export const usePlausibilityContradictions = (projectId: string) => {
  const {
    data: contradictionsData,
    isLoading: contradictionsLoading,
    isError: contradictionsError,
  } = useLiveQuery((q) =>
    q
      .from({ contradictions: contradictionsCollection })
      .where(({ contradictions }) => eq(contradictions.projectId, projectId)),
  );
  const {
    data: requestItemsData,
    isLoading: requestItemsLoading,
    isError: requestItemsError,
  } = useLiveQuery((q) =>
    q
      .from({ items: requestItemsCollection })
      .where(({ items }) => eq(items.projectId, projectId)),
  );

  const contradictionIdsOnRequestList = new Set(
    requestItemsData
      .filter((item) => getRequestItemSourceType(item) === 'contradiction')
      .map((item) => getRequestItemSourceItemId(item))
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );

  const contradictions: PlausibilityContradictionListItem[] =
    contradictionsData.map((contradiction) => ({
      ...contradiction,
      isOnRequestList: contradictionIdsOnRequestList.has(contradiction.id),
    }));

  return {
    contradictions,
    isLoading: contradictionsLoading || requestItemsLoading,
    isError: contradictionsError || requestItemsError,
  };
};
