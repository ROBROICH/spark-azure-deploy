import { requiredDocumentsCollection } from '../collections/requiredDocuments.collection';
import type {
  RequiredDocument,
  RequiredDocumentNode,
} from '../schemas/requiredDocument.schema';

/**
 * A persisted optimistic mutation whose settlement callers can await via
 * `isPersisted.promise` to surface failure feedback.
 */
export type PersistenceTransaction = {
  isPersisted: { promise: Promise<unknown> };
};

const normalizeLabel = (value: string) => value.trim().toLowerCase();
const CUSTOM_CATEGORY_LABEL = normalizeLabel('Benutzerdefiniert');

const findCustomCategoryNode = (structure: RequiredDocumentNode[]) =>
  structure.find(
    (node) =>
      node.children !== undefined &&
      normalizeLabel(node.name) === CUSTOM_CATEGORY_LABEL,
  );

const getCurrentCustomIds = (projectId: string, customCategoryId: string) =>
  new Set(
    Array.from(requiredDocumentsCollection.state.values())
      .filter((d) => d.projectId === projectId)
      .filter(
        (d) =>
          !d.isCategory &&
          d.parentId === customCategoryId &&
          d.origin === 'custom',
      )
      .map((d) => d.id),
  );

/**
 * Synchronizes the custom required-documents subtree. Deleting a type clears
 * its assignments atomically in the backend.
 *
 * @returns The optimistic transactions, so callers can await persistence and
 * surface a failure instead of closing as if the save succeeded.
 */
export const setRequiredDocumentsStructure = (
  projectId: string,
  structure: RequiredDocumentNode[],
): PersistenceTransaction[] => {
  const transactions: PersistenceTransaction[] = [];
  const projectDocs = Array.from(
    requiredDocumentsCollection.state.values(),
  ).filter((d) => d.projectId === projectId);
  const customCategoryNode = findCustomCategoryNode(structure);
  const customCategoryIdFromStructure = customCategoryNode?.id;
  const customCategory =
    projectDocs.find(
      (d) =>
        d.isCategory &&
        (d.id === customCategoryIdFromStructure ||
          normalizeLabel(d.name) === CUSTOM_CATEGORY_LABEL),
    ) ?? null;
  const customCategoryId = customCategory?.id ?? customCategoryNode?.id;
  if (!customCategoryId) {
    return transactions;
  }
  const effectiveCustomCategoryNode = customCategoryNode ?? {
    id: customCategoryId,
    name: 'Benutzerdefiniert',
    children: [],
  };

  const nextCustomDocs: RequiredDocument[] = (
    effectiveCustomCategoryNode.children ?? []
  )
    .map((node) => ({
      projectId,
      id: node.id,
      name: node.name.trim(),
      parentId: customCategoryId,
      isCategory: false,
      origin: 'custom' as const,
      // Optimistic default for a freshly added custom type; the backend's
      // is_resolved is reconciled into the row by the collection on insert.
      isResolved: false,
    }))
    .filter((doc) => doc.name.length > 0);

  const currentCustomIds = getCurrentCustomIds(projectId, customCategoryId);

  for (const doc of nextCustomDocs) {
    if (!currentCustomIds.has(doc.id)) {
      transactions.push(
        requiredDocumentsCollection.insert(doc, {
          optimistic: false,
        }),
      );
      continue;
    }

    const currentDoc = projectDocs.find((d) => d.id === doc.id);
    if (currentDoc && currentDoc.name !== doc.name) {
      transactions.push(
        requiredDocumentsCollection.update(doc.id, (draft) => {
          draft.name = doc.name;
        }),
      );
    }
    currentCustomIds.delete(doc.id);
  }

  if (currentCustomIds.size === 0) {
    return transactions;
  }

  for (const id of currentCustomIds) {
    transactions.push(requiredDocumentsCollection.delete(id));
  }

  return transactions;
};
