import {
  v1SupplementaryRequestsCreateSupplementaryRequest as createSupplementaryRequest,
  v1SupplementaryRequestsDeleteSupplementaryRequest as deleteSupplementaryRequest,
  v1SupplementaryRequestsListSupplementaryRequests as listSupplementaryRequests,
  v1SupplementaryRequestsUpdateSupplementaryRequest as updateSupplementaryRequest,
  type V1SupplementaryRequestsCreateSupplementaryRequestData as CreateSupplementaryRequestData,
  type SupplementaryRequestResponse,
  type V1SupplementaryRequestsUpdateSupplementaryRequestData as UpdateSupplementaryRequestData,
} from '@/api-clients/backend';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { queryCollectionOptions } from '@tanstack/query-db-collection';
import {
  BasicIndex,
  createCollection,
  walkExpression,
  type LoadSubsetOptions,
} from '@tanstack/react-db';
import { invalidateRequestReads } from '../requestQueries';

import {
  requestItemFromApi,
  type RequestItem,
  type RequestItemSourceRef,
} from '../schemas/requestItem.schema';

type CreateSupplementaryRequestRequest = CreateSupplementaryRequestData['body'];
type UpdateSupplementaryRequestRequest = UpdateSupplementaryRequestData['body'];
type ApiSourceRef = NonNullable<SupplementaryRequestResponse['sourceRef']>;

export const REQUEST_ITEMS_PAGE_SIZE = 50;

const toApiSourceRef = (
  sourceRef?: RequestItemSourceRef,
): ApiSourceRef | undefined => {
  if (!sourceRef?.itemId) {
    return undefined;
  }
  return {
    type: sourceRef.type,
    itemId: sourceRef.itemId,
  };
};

export const requestItemToCreatePayload = (
  item: RequestItem,
): CreateSupplementaryRequestRequest => ({
  title: item.title,
  reason: item.reason,
  priority: item.priority,
  sourceRef: toApiSourceRef(item.sourceRef),
  includedInLetter: item.includedInLetter,
  documentId: item.documentId,
  topicId: item.topicId,
});

const toPatchPayload = (
  changes: Partial<RequestItem>,
): UpdateSupplementaryRequestRequest => {
  const payload: UpdateSupplementaryRequestRequest = {};

  if (typeof changes.title === 'string') {
    payload.title = changes.title;
  }
  if (typeof changes.reason === 'string') {
    payload.reason = changes.reason;
  }
  if (typeof changes.priority === 'string') {
    payload.priority = changes.priority;
  }
  if (typeof changes.includedInLetter === 'boolean') {
    payload.includedInLetter = changes.includedInLetter;
  }
  if ('topicId' in changes) {
    payload.topicId = changes.topicId ?? null;
  }
  if ('documentId' in changes) {
    payload.documentId = changes.documentId ?? null;
  }
  if ('sourceRef' in changes) {
    payload.sourceRef = toApiSourceRef(changes.sourceRef) ?? null;
  }

  return payload;
};

/**
 * Reads the project and page window requested by the collection subset.
 * @param search - Optional search across the complete project dataset.
 * @param subset - Project boundary and requested offset window.
 * @returns The requested rows, or no rows when no project is selected.
 */
const fetchRequestItems = async (
  search: string | undefined,
  subset: LoadSubsetOptions | undefined,
): Promise<RequestItem[]> => {
  let projectId: string | undefined;
  walkExpression(subset?.where, (expression) => {
    if (expression.type !== 'func') {
      return;
    }
    const [field, value] = expression.args;
    if (
      field?.type !== 'ref' ||
      value?.type !== 'val' ||
      typeof value.value !== 'string'
    ) {
      return;
    }
    if (expression.name === 'eq' && field.path[0] === 'projectId') {
      projectId = value.value;
    }
  });
  if (!projectId) {
    return [];
  }

  const { data } = await listSupplementaryRequests({
    path: { projectId },
    query: {
      sort: 'created_at:asc',
      search,
      limit: subset?.limit ?? REQUEST_ITEMS_PAGE_SIZE,
      offset: subset?.offset ?? 0,
    },
  });
  if (!data) {
    throw new Error('Failed to fetch request items');
  }
  return data.map(requestItemFromApi);
};

const invalidateRequestItemProjects = (items: RequestItem[]) =>
  Promise.all(
    [...new Set(items.map((item) => item.projectId))].map(
      invalidateRequestReads,
    ),
  );

/**
 * Search scopes the server dataset while TanStack DB owns project windows and mutations.
 * @param search - Optional complete-dataset search; never a filter over only loaded rows.
 * @returns An on-demand collection isolated from other search results.
 */
export const createRequestItemsCollection = (search?: string) =>
  createCollection(
    queryCollectionOptions({
      id: JSON.stringify(['request-items', search ?? null]),
      syncMode: 'on-demand',
      autoIndex: 'eager',
      defaultIndexType: BasicIndex,
      queryKey: ['request-items', { search }],
      queryFn: (ctx) => fetchRequestItems(search, ctx.meta?.loadSubsetOptions),
      queryClient,
      getKey: (item) => item.id,
      onInsert: async ({ transaction }) => {
        const results = await Promise.all(
          transaction.mutations.map(async (mutation) => {
            const { data } = await createSupplementaryRequest({
              path: { projectId: mutation.modified.projectId },
              body: requestItemToCreatePayload(mutation.modified),
            });

            if (!data) {
              throw new Error('Failed to create request item');
            }
            return requestItemFromApi(data);
          }),
        );

        await invalidateRequestItemProjects(
          transaction.mutations.map(({ modified }) => modified),
        );
        return results;
      },
      onUpdate: async ({ transaction }) => {
        const results = await Promise.all(
          transaction.mutations.map(async (mutation) => {
            const body = toPatchPayload(mutation.changes);
            if (Object.keys(body).length === 0) {
              return { ...mutation.original, ...mutation.changes };
            }

            const { data } = await updateSupplementaryRequest({
              path: {
                projectId: mutation.original.projectId,
                requestId: mutation.key,
              },
              body,
            });

            if (!data) {
              throw new Error('Failed to update request item');
            }
            return requestItemFromApi(data);
          }),
        );

        await invalidateRequestItemProjects(
          transaction.mutations.map(({ original }) => original),
        );
        return results;
      },
      onDelete: async ({ transaction }) => {
        await Promise.all(
          transaction.mutations.map(async (mutation) => {
            await deleteSupplementaryRequest({
              path: {
                projectId: mutation.original.projectId,
                requestId: mutation.key,
              },
            });
          }),
        );
        await invalidateRequestItemProjects(
          transaction.mutations.map(({ original }) => original),
        );
      },
    }),
  );

export const requestItemsCollection = createRequestItemsCollection();
