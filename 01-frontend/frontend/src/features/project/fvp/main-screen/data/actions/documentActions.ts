import { documentAssignmentsCollection } from '../collections/documentAssignments.collection';

/**
 * Upserts the human-selected document type for a file as a single backend
 * write: updates the existing assignment row when one is loaded, otherwise
 * inserts a new row. Both paths persist through the collection's fail-closed
 * `onUpdate`/`onInsert` handlers, so a failed PATCH rolls back the optimistic
 * state instead of leaving the row crashed or silently stale. Returns the
 * optimistic transaction so callers can await persistence and surface failure.
 */
const upsertHumanDocumentType = (
  projectId: string,
  documentId: string,
  typeId: string | null,
) => {
  if (documentAssignmentsCollection.state.has(documentId)) {
    return documentAssignmentsCollection.update(documentId, (draft) => {
      draft.humanRequiredDocumentTypeId = typeId;
      draft.documentTypeId = typeId;
    });
  }

  return documentAssignmentsCollection.insert({
    projectId,
    documentId,
    aiSuggestedDocumentTypeId: null,
    humanRequiredDocumentTypeId: typeId,
    documentTypeId: typeId,
    documentTypeName: null,
    isResolved: false,
  });
};

export const confirmDocumentType = (projectId: string, documentId: string) => {
  const existing = documentAssignmentsCollection.state.get(documentId);
  const nextTypeId =
    existing?.aiSuggestedDocumentTypeId ?? existing?.documentTypeId ?? null;

  return upsertHumanDocumentType(projectId, documentId, nextTypeId);
};

export const setDocumentType = (
  projectId: string,
  documentId: string,
  typeId: string,
) => {
  return upsertHumanDocumentType(projectId, documentId, typeId);
};
