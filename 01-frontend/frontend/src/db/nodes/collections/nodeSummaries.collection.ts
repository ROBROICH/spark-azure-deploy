import {
  v1DocumentManagementServiceListNodes as dmsListNodes,
  v1ExaminationServiceListNodes as examListNodes,
  v1FeedbackListNodes as feedbackListNodes,
  v1ObjectionsManagementServiceListNodes as omsListNodes,
  v1ProjectLogicServiceListNodes as plsListNodes,
  v1AdministrativeFileDraftListNodes as vaeListNodes,
} from '@/api-clients/backend';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { BasicIndex, createCollection } from '@tanstack/react-db';
import { toCompositeKey } from '../compositeKey';
import { createLruCache } from '../lruCache';
import { installNodeSummariesBackgroundRefresh } from './nodeSummariesFreshness';

const summariesCache =
  createLruCache<ReturnType<typeof createSummariesCollection>>(10);

export const getNodeSummariesCollectionQueryKey = (projectId: string) =>
  ['node-summaries', projectId] as const;

const getVersionedCacheKey = (projectId: string, projectVersion: number) =>
  `${projectId}:v${projectVersion}`;

/**
 * Loads and flattens lightweight summaries from every graph backend so the
 * shared project graph can rebuild from one merged node list.
 */
const loadNodeSummaries = async (projectId: string, projectVersion: number) => {
  const query = { projectVersion: projectVersion };
  const [examRes, feedbackRes, plsRes, dmsRes, omsRes, vaeRes] =
    await Promise.all([
      examListNodes({
        path: { projectId: projectId },
        query,
        throwOnError: true,
      }),
      feedbackListNodes({
        path: { projectId: projectId },
        query,
        throwOnError: true,
      }),
      plsListNodes({
        path: { projectId: projectId },
        query,
        throwOnError: true,
      }),
      dmsListNodes({
        path: { projectId: projectId },
        query,
        throwOnError: true,
      }),
      omsListNodes({
        path: { projectId: projectId },
        query,
        throwOnError: true,
      }),
      vaeListNodes({
        path: { projectId: projectId },
        query,
        throwOnError: true,
      }),
    ]);

  return [
    ...examRes.data.nodes,
    ...feedbackRes.data.nodes,
    ...plsRes.data.nodes,
    ...dmsRes.data.nodes,
    ...omsRes.data.nodes,
    ...vaeRes.data.nodes,
  ].map((ref) => {
    return { ...ref, compositeKey: toCompositeKey(ref) };
  });
};

/** Fetches lightweight node summaries from all graph backends and merges them into a single collection. */
function createSummariesCollection(projectId: string, projectVersion: number) {
  const options = queryCollectionOptions({
    autoIndex: 'eager',
    defaultIndexType: BasicIndex,
    id: `node-summaries-${projectId}-v${projectVersion}`,
    queryKey: [
      ...getNodeSummariesCollectionQueryKey(projectId),
      projectVersion,
    ],
    staleTime: Infinity,
    queryFn: () => loadNodeSummaries(projectId, projectVersion),
    queryClient,
    getKey: (item) => item.compositeKey,
  });

  // https://github.com/TanStack/db/discussions/1309
  const originalSync = options.sync.sync;
  options.sync.sync = (params) => {
    const result = originalSync(params);
    return {
      ...result,
      unloadSubset: undefined, // rows persist across unmount
    };
  };

  const collection = createCollection(options);
  installNodeSummariesBackgroundRefresh(collection);
  return collection;
}

export function getNodeSummariesCollection(
  projectId: string,
  projectVersion: number,
) {
  const cacheKey = getVersionedCacheKey(projectId, projectVersion);
  const cached = summariesCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const collection = createSummariesCollection(projectId, projectVersion);
  summariesCache.set(cacheKey, collection);
  return collection;
}

export async function reloadNodeSummariesCollection(projectId: string) {
  await queryClient.invalidateQueries({
    queryKey: getNodeSummariesCollectionQueryKey(projectId),
  });
}
