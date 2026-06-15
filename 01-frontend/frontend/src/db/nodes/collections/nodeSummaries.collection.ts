import { listNodesProjectIdNodesGet as dmsListNodes } from '@/api-clients/dms-module';
import { listNodesProjectIdNodesGet as examListNodes } from '@/api-clients/examination-module';
import { listNodesProjectIdNodesGet as feedbackListNodes } from '@/api-clients/feedback-module';
import { listNodesProjectIdNodesGet as omsListNodes } from '@/api-clients/oms-module';
import { listNodesProjectIdNodesGet as plsListNodes } from '@/api-clients/pls-module';
import { listNodesProjectIdNodesGet as vaeListNodes } from '@/api-clients/vae-module';
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
  const query = { project_version: projectVersion };
  const [examRes, feedbackRes, plsRes, dmsRes, omsRes, vaeRes] =
    await Promise.all([
      examListNodes({
        path: { project_id: projectId },
        query,
        throwOnError: true,
      }),
      feedbackListNodes({
        path: { project_id: projectId },
        query,
        throwOnError: true,
      }),
      plsListNodes({
        path: { project_id: projectId },
        query,
        throwOnError: true,
      }),
      dmsListNodes({
        path: { project_id: projectId },
        query,
        throwOnError: true,
      }),
      omsListNodes({
        path: { project_id: projectId },
        query,
        throwOnError: true,
      }),
      vaeListNodes({
        path: { project_id: projectId },
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
