import {
  v1ProtocolGetProjectHistory as getProjectHistory,
  type V1ProtocolGetProjectHistoryData as GetProjectHistoryData,
  type HistoryItem,
} from '@/api-clients/backend';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';
import { stableJsonStringify } from '../stableJsonStringify';

export type AuditLogHistoryQuery = NonNullable<GetProjectHistoryData['query']>;

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

const getCollectionCacheKey = (
  projectId: string,
  query: AuditLogHistoryQuery,
) => `${projectId}:${stableJsonStringify(query)}`;

export const getAuditLogHistoryItemKey = (item: HistoryItem) =>
  JSON.stringify([
    item.timestamp,
    item.entityType,
    item.entityId,
    item.service,
    item.changeType,
    item.source,
    item.actorUserId,
    item.triggeredByUserId,
    item.workflowRunId,
    item.requestId,
    item.workflowType,
    item.actionType,
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
  const requestKey = stableJsonStringify(query);
  const cacheKey = getCollectionCacheKey(projectId, query);
  const id = `audit-log-history-${projectId}-${hashString(requestKey)}`;

  return createCollection(
    queryCollectionOptions<HistoryItem>({
      id,
      queryKey: ['audit-log-history', projectId, requestKey],
      queryFn: async (): Promise<HistoryItem[]> => {
        const { data } = await getProjectHistory({
          path: { projectId: projectId },
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
