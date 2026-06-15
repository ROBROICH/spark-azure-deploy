import {
  getProjectHistoryProjectsProjectIdHistoryGet,
  type GetProjectHistoryProjectsProjectIdHistoryGetData,
  type HistoryItem,
} from '@/api-clients/protocol-module';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';
import { stableJsonStringify } from '../stableJsonStringify';

export type AuditLogHistoryQuery = NonNullable<
  GetProjectHistoryProjectsProjectIdHistoryGetData['query']
>;

export type AuditLogHistoryMetadata = {
  total: number;
  limit: number;
  offset: number;
};

const MAX_COLLECTION_CACHE_SIZE = 20;
const collectionCache = new Map<
  string,
  ReturnType<typeof createAuditLogHistoryCollection>
>();
const metadataCache = new Map<string, AuditLogHistoryMetadata>();

const hashString = (value: string) => {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }

  return hash.toString(36);
};

export const getAuditLogHistoryRequestKey = (query: AuditLogHistoryQuery) =>
  stableJsonStringify(query);

const getCollectionCacheKey = (
  projectId: string,
  query: AuditLogHistoryQuery,
) => `${projectId}:${getAuditLogHistoryRequestKey(query)}`;

export const getAuditLogHistoryItemKey = (item: HistoryItem) =>
  JSON.stringify([
    item.timestamp,
    item.entity_type,
    item.entity_id,
    item.service,
    item.change_type,
    item.source,
    item.actor_user_id,
    item.triggered_by_user_id,
    item.workflow_run_id,
    item.request_id,
    item.workflow_type,
    item.action_type,
  ]);

const trimCache = () => {
  if (collectionCache.size < MAX_COLLECTION_CACHE_SIZE) {
    return;
  }

  const oldestKey = collectionCache.keys().next().value;
  if (oldestKey) {
    collectionCache.delete(oldestKey);
    metadataCache.delete(oldestKey);
  }
};

const createAuditLogHistoryCollection = (
  projectId: string,
  query: AuditLogHistoryQuery,
) => {
  const requestKey = getAuditLogHistoryRequestKey(query);
  const cacheKey = getCollectionCacheKey(projectId, query);
  const id = `audit-log-history-${projectId}-${hashString(requestKey)}`;

  return createCollection(
    queryCollectionOptions<HistoryItem>({
      id,
      queryKey: ['audit-log-history', projectId, requestKey],
      queryFn: async (): Promise<HistoryItem[]> => {
        const { data } = await getProjectHistoryProjectsProjectIdHistoryGet({
          path: { project_id: projectId },
          query,
          throwOnError: true,
        });

        metadataCache.set(cacheKey, {
          total: data.total,
          limit: data.limit,
          offset: data.offset,
        });

        return data.items;
      },
      queryClient,
      getKey: getAuditLogHistoryItemKey,
    }),
  );
};

export const getAuditLogHistoryCollection = (
  projectId: string,
  query: AuditLogHistoryQuery,
) => {
  const cacheKey = getCollectionCacheKey(projectId, query);
  const cached = collectionCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  trimCache();
  const collection = createAuditLogHistoryCollection(projectId, query);
  collectionCache.set(cacheKey, collection);

  return collection;
};

export const getAuditLogHistoryMetadata = (
  projectId: string,
  query: AuditLogHistoryQuery,
) => metadataCache.get(getCollectionCacheKey(projectId, query));

export const resetAuditLogHistoryCollection = async (
  projectId: string,
  query: AuditLogHistoryQuery,
) => {
  const cacheKey = getCollectionCacheKey(projectId, query);
  const collection = getAuditLogHistoryCollection(projectId, query);

  metadataCache.delete(cacheKey);
  await collection.utils.refetch();
};
