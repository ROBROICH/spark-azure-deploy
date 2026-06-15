import {
  createSupplementaryRequestProjectsProjectIdSupplementaryRequestsPost,
  deleteSupplementaryRequestProjectsProjectIdSupplementaryRequestsRequestIdDelete,
  listSupplementaryRequestsProjectsProjectIdSupplementaryRequestsGet,
  updateSupplementaryRequestProjectsProjectIdSupplementaryRequestsRequestIdPatch,
  type CreateSupplementaryRequestRequest,
  type SourceRef,
  type SupplementaryRequestResponse,
  type UpdateSupplementaryRequestRequest,
} from '@/api-clients/supplementary-requests-module';
import { queryClient } from '@/integrations/tanstack-query/root-provider';
import {
  parseLoadSubsetOptions,
  queryCollectionOptions,
} from '@tanstack/query-db-collection';
import { createCollection } from '@tanstack/react-db';

import {
  requestItemSchema,
  type RequestItem,
  type RequestItemSourceRef,
} from '../schemas/requestItem.schema';

const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const extractProjectId = (opts: Record<string, unknown>): string => {
  const parsed = parseLoadSubsetOptions(opts);
  const filter = parsed.filters.find((f) => f.field.join('.') === 'projectId');
  const value = filter?.value;
  return typeof value === 'string' ? value : '';
};

const fromApiSourceRef = (
  sourceRef?: SourceRef | null,
): RequestItemSourceRef | undefined => {
  if (!sourceRef) {
    return undefined;
  }
  return {
    type: sourceRef.type,
    itemId: sourceRef.item_id,
  };
};

const toApiSourceRef = (
  sourceRef?: RequestItemSourceRef,
): SourceRef | undefined => {
  if (!sourceRef?.itemId) {
    return undefined;
  }
  return {
    type: sourceRef.type,
    item_id: sourceRef.itemId,
  };
};

const toApiUuid = (value: string | undefined): string =>
  value && UUID_PATTERN.test(value) ? value : NIL_UUID;

export const requestItemFromApi = (
  item: SupplementaryRequestResponse,
): RequestItem =>
  requestItemSchema.parse({
    id: item.id,
    projectId: item.project_id,
    sourceRef: fromApiSourceRef(item.source_ref),
    priority: item.priority,
    title: item.title,
    reason: item.reason,
    createdAt: new Date(item.created_at),
    topicId: item.topic_id ?? undefined,
    documentId: item.document_id ?? undefined,
    includedInLetter: item.included_in_letter,
  });

export const requestItemToCreatePayload = (
  item: RequestItem,
): CreateSupplementaryRequestRequest => ({
  title: item.title,
  reason: item.reason,
  priority: item.priority,
  source_ref: toApiSourceRef(item.sourceRef),
  included_in_letter: item.includedInLetter,
  document_id: toApiUuid(item.documentId),
  topic_id: toApiUuid(item.topicId),
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
  if ('includedInLetter' in changes) {
    payload.included_in_letter = changes.includedInLetter ?? null;
  }
  if (typeof changes.topicId === 'string') {
    payload.topic_id = toApiUuid(changes.topicId);
  }
  if (typeof changes.documentId === 'string') {
    payload.document_id = toApiUuid(changes.documentId);
  }
  if ('sourceRef' in changes) {
    payload.source_ref = toApiSourceRef(changes.sourceRef) ?? null;
  }

  return payload;
};

export const requestItemsCollection = createCollection(
  queryCollectionOptions({
    id: 'request-items',
    syncMode: 'on-demand',
    queryKey: (opts) => {
      const projectId = extractProjectId(opts as Record<string, unknown>);
      return projectId ? ['request-items', projectId] : ['request-items'];
    },
    queryFn: async (ctx): Promise<RequestItem[]> => {
      const projectId = extractProjectId(
        ctx.meta?.loadSubsetOptions as Record<string, unknown>,
      );
      if (!projectId) {
        return [];
      }

      const { data } =
        await listSupplementaryRequestsProjectsProjectIdSupplementaryRequestsGet(
          {
            path: { project_id: projectId },
            query: { sort: 'created_at:asc' },
          },
        );
      if (!data) {
        throw new Error('Failed to fetch request items');
      }

      return data.map(requestItemFromApi);
    },
    queryClient,
    getKey: (item) => item.id,
    onInsert: async ({ transaction }) => {
      const results = await Promise.all(
        transaction.mutations.map(async (mutation) => {
          const { data } =
            await createSupplementaryRequestProjectsProjectIdSupplementaryRequestsPost(
              {
                path: { project_id: mutation.modified.projectId },
                body: requestItemToCreatePayload(mutation.modified),
              },
            );

          if (!data) {
            throw new Error('Failed to create request item');
          }
          return requestItemFromApi(data);
        }),
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

          const { data } =
            await updateSupplementaryRequestProjectsProjectIdSupplementaryRequestsRequestIdPatch(
              {
                path: {
                  project_id: mutation.original.projectId,
                  request_id: mutation.key,
                },
                body,
              },
            );

          if (!data) {
            throw new Error('Failed to update request item');
          }
          return requestItemFromApi(data);
        }),
      );

      return results;
    },
    onDelete: async ({ transaction }) => {
      await Promise.all(
        transaction.mutations.map(async (mutation) => {
          await deleteSupplementaryRequestProjectsProjectIdSupplementaryRequestsRequestIdDelete(
            {
              path: {
                project_id: mutation.original.projectId,
                request_id: mutation.key,
              },
            },
          );
        }),
      );
    },
  }),
);
