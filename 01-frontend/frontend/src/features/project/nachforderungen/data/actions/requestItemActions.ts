import { createSupplementaryRequestProjectsProjectIdSupplementaryRequestsPost } from '@/api-clients/supplementary-requests-module';
import {
  requestItemsCollection,
  requestItemFromApi,
  requestItemToCreatePayload,
} from '@/features/project/nachforderungen/data/collections/requestItems.collection';
import type {
  RequestItemPriority,
  RequestItemSourceRef,
} from '@/features/project/nachforderungen/data/schemas/requestItem.schema';

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

  const { data } =
    await createSupplementaryRequestProjectsProjectIdSupplementaryRequestsPost({
      path: { project_id: projectId },
      body: requestItemToCreatePayload(item),
      throwOnError: true,
    });

  requestItemsCollection.utils.writeInsert(requestItemFromApi(data));
  await requestItemsCollection.utils.refetch();
};

/**
 * Edit an existing request item.
 */
export const editRequestItem = async (
  id: string,
  priority: RequestItemPriority,
  title: string,
  reason: string,
) => {
  const tx = requestItemsCollection.update(id, (draft) => {
    draft.priority = priority;
    draft.title = title;
    draft.reason = reason;
  });
  await tx.isPersisted.promise;
};

/**
 * Remove an item from the request list.
 */
export const removeRequestItem = async (id: string) => {
  const tx = requestItemsCollection.delete(id);
  await tx.isPersisted.promise;
};

/**
 * Toggle whether a request item is included in the supplementary request letter.
 * Defaults to included when the value is not set yet.
 */
export const toggleIncludedInLetter = (id: string) => {
  requestItemsCollection.update(id, (draft) => {
    draft.includedInLetter = draft.includedInLetter !== true;
  });
};
