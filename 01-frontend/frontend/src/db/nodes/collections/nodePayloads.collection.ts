import { queryClient } from '@/integrations/tanstack-query/root-provider';
import {
  parseWhereExpression,
  queryCollectionOptions,
} from '@tanstack/query-db-collection';
import {
  BasicIndex,
  createCollection,
  type LoadSubsetOptions,
} from '@tanstack/react-db';
import { fromCompositeKey } from '../compositeKey';
import { createLruCache } from '../lruCache';
import type { NodePayload, NodePayloadCollectionItem, NodeRef } from '../types';
import { createNodeDataLoader } from './payloadLoader';

const payloadsCache =
  createLruCache<ReturnType<typeof createPayloadsCollection>>(10);

export const getNodePayloadsCollectionQueryKey = (projectId: string) =>
  ['node-payloads', projectId] as const;

const getVersionedCacheKey = (projectId: string, projectVersion: number) =>
  `${projectId}:v${projectVersion}`;

/** Parses composite-key filters from TanStack DB subset loads into concrete node refs. */
const parseNodeRefs = (options: LoadSubsetOptions): NodeRef[] => {
  if (!options.where) {
    return [];
  }
  const refs: NodeRef[] = [];

  const addRef = (value: string) => {
    const ref = fromCompositeKey(value);

    if (ref.id !== '') {
      refs.push(ref);
    }
  };

  parseWhereExpression(options.where, {
    handlers: {
      eq: (field: string[], value: string) => {
        if (field[0] === 'compositeKey') {
          addRef(value);
        }
      },
      in: (field: string[], values: string[]) => {
        if (field[0] === 'compositeKey') {
          values.forEach(addRef);
        }
      },
    },
  });

  return refs;
};

/**
 * Creates payload collection scoped to a projectId
 * Batch fetches are using NodeRefs to fetch multiple nodes in a single request.
 * As such we are composing a key of `${type}:${id}` with inArray to then
 * parse it back here into NodeRefs before fetching.
 */
function createPayloadsCollection(projectId: string, projectVersion: number) {
  const loader = createNodeDataLoader(projectId, projectVersion);

  const options = queryCollectionOptions<NodePayloadCollectionItem>({
    autoIndex: 'eager',
    defaultIndexType: BasicIndex,
    id: `node-payloads-${projectId}-v${projectVersion}`,
    syncMode: 'on-demand',
    staleTime: Infinity,
    queryKey: [...getNodePayloadsCollectionQueryKey(projectId), projectVersion],
    queryFn: async (ctx): Promise<NodePayload[]> => {
      if (!ctx.meta?.loadSubsetOptions) {
        throw new Error(
          'You need to pass in a where clause to fetch node payloads',
        );
      }
      const refs = parseNodeRefs(ctx.meta.loadSubsetOptions);
      if (refs.length === 0) {
        return [];
      }

      const results = await loader.loadMany(refs);
      return results.filter(
        (result): result is NodePayload => !(result instanceof Error),
      );
    },
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
  return Object.assign(createCollection(options), {
    clearLoaderCache: () => {
      loader.clearAll();
    },
  });
}

export function getNodePayloadsCollection(
  projectId: string,
  projectVersion: number,
) {
  const cacheKey = getVersionedCacheKey(projectId, projectVersion);
  const cached = payloadsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const collection = createPayloadsCollection(projectId, projectVersion);
  payloadsCache.set(cacheKey, collection);
  return collection;
}

export async function reloadNodePayloadsCollection(
  projectId: string,
  projectVersion: number,
) {
  payloadsCache
    .get(getVersionedCacheKey(projectId, projectVersion))
    ?.clearLoaderCache();
  await queryClient.invalidateQueries({
    queryKey: getNodePayloadsCollectionQueryKey(projectId),
  });
}
