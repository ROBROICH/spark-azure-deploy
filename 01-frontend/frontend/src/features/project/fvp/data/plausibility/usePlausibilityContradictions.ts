import { eq, useLiveQuery } from '@tanstack/react-db';

import { useRequestSources } from '@/features/project/nachforderungen/data/requestQueries';
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
    data: requestSources = [],
    isLoading: requestItemsLoading,
    isError: requestItemsError,
  } = useRequestSources(projectId);

  const contradictionIdsOnRequestList = new Set(
    requestSources.flatMap((ref) =>
      ref.type === 'contradiction' ? [ref.itemId] : [],
    ),
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
