import { requiredDocumentsCollection } from '../collections/requiredDocuments.collection';

/**
 * Returns the optimistic transaction so callers can observe
 * `isPersisted.promise` and surface failure feedback instead of treating the
 * status toggle as guaranteed.
 */
export const resolveRequiredDocument = (_projectId: string, id: string) =>
  requiredDocumentsCollection.update(id, (draft) => {
    draft.isResolved = true;
  });

export const unresolveRequiredDocument = (_projectId: string, id: string) =>
  requiredDocumentsCollection.update(id, (draft) => {
    draft.isResolved = false;
  });
