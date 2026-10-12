import { requestItemFromApi } from '../schemas/requestItem.schema';
import {
  v1SupplementaryRequestsCreateSupplementaryRequest as createSupplementaryRequest,
  v1SupplementaryRequestsDeleteSupplementaryRequest,
} from '@/api-clients/backend';
import {
  requestItemsCollection,
  requestItemToCreatePayload,
} from '@/features/project/nachforderungen/data/collections/requestItems.collection';
import type {
  RequestItemPriority,
  RequestItemSourceRef,
} from '@/features/project/nachforderungen/data/schemas/requestItem.schema';

import { invalidateRequestReads } from '../requestQueries';

export const addRequestItem = async (
  projectId: string,
  priority: RequestItemPriority,
  title: string,
  reason: string,
  sourceRef?: RequestItemSourceRef,
  topicId?: string,
  documentId?: string,
) => {
  const item = {
    id: crypto.randomUUID(),
    projectId,
    sourceRef,
    topicId,
    documentId,
    priority,
    title,
    reason,
    createdAt: new Date(),
    includedInLetter: false,
  } as const;

  const { data } = await createSupplementaryRequest({
    path: { projectId },
    body: requestItemToCreatePayload(item),
    throwOnError: true,
  });

  requestItemsCollection.utils.writeInsert(requestItemFromApi(data));
  await invalidateRequestReads(projectId);
};

/**
 * Edit an existing request item.
 */
export const editRequestItem = async (
  id: string,
  priority: RequestItemPriority,
  title: string,
  reason: string,
  collection = requestItemsCollection,
) => {
  const tx = collection.update(id, (draft) => {
    draft.priority = priority;
    draft.title = title;
    draft.reason = reason;
  });
  await tx.isPersisted.promise;
};

export const removeRequestItem = async (
  projectId: string,
  requestId: string,
) => {
  await v1SupplementaryRequestsDeleteSupplementaryRequest({
    path: { projectId, requestId },
    throwOnError: true,
  });
  await invalidateRequestReads(projectId);
};

/**
 * Toggle whether a request item is included in the supplementary request letter.
 * Defaults to included when the value is not set yet.
 */
export const toggleIncludedInLetter = (
  id: string,
  collection = requestItemsCollection,
) => {
  collection.update(id, (draft) => {
    draft.includedInLetter = draft.includedInLetter !== true;
  });
};
