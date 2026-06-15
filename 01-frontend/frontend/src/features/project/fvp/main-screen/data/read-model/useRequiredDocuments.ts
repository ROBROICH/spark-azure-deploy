import { eq, useLiveQuery } from '@tanstack/react-db';

import { requiredDocumentsCollection } from '../collections/requiredDocuments.collection';
import type {
  RequiredDocument,
  RequiredDocumentNode,
} from '../schemas/requiredDocument.schema';

const customCategoryLabel = 'benutzerdefiniert';

export const compareByName = (
  a: Pick<RequiredDocument, 'name'>,
  b: Pick<RequiredDocument, 'name'>,
) => {
  // Equal names are intentionally treated as equivalent here. We do not expect
  // exact duplicate required-document names within the same category in product
  // data, so no extra deterministic tie-breaker is needed.
  return a.name.localeCompare(b.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
};

const isCustomCategory = (doc: Pick<RequiredDocument, 'name'>) =>
  doc.name.trim().toLowerCase() === customCategoryLabel;

const getOrderedCategories = (documents: RequiredDocument[]) => {
  const categories = documents.filter((doc) => doc.isCategory);

  const nonCustomCategories = categories
    .filter((category) => !isCustomCategory(category))
    .sort(compareByName);
  const customCategories = categories
    .filter((category) => isCustomCategory(category))
    .sort(compareByName);

  return [...nonCustomCategories, ...customCategories];
};

const getOrderedDocumentTypes = (documents: RequiredDocument[]) => {
  const categories = getOrderedCategories(documents);
  const nonCategories = documents.filter((doc) => !doc.isCategory);

  const byParentId = new Map<string, RequiredDocument[]>();
  for (const doc of nonCategories) {
    if (!doc.parentId) {
      continue;
    }
    const current = byParentId.get(doc.parentId) ?? [];
    current.push(doc);
    byParentId.set(doc.parentId, current);
  }

  const ordered: RequiredDocument[] = [];
  const consumedIds = new Set<string>();

  for (const category of categories) {
    const children = (byParentId.get(category.id) ?? []).sort(compareByName);
    for (const child of children) {
      ordered.push(child);
      consumedIds.add(child.id);
    }
  }

  const orphaned = nonCategories
    .filter((doc) => !consumedIds.has(doc.id))
    .sort(compareByName);

  return [...ordered, ...orphaned];
};

export const useRequiredDocumentTypes = (projectId: string) => {
  const { data, isLoading, isError } = useLiveQuery((q) =>
    q
      .from({ docs: requiredDocumentsCollection })
      .where(({ docs }) => eq(docs.projectId, projectId)),
  );

  const sortedData = getOrderedDocumentTypes(data);

  return { documentTypes: sortedData, isLoading, isError };
};

export const useAllRequiredDocuments = (projectId: string) => {
  const { data, isLoading, isError } = useLiveQuery((q) =>
    q
      .from({ docs: requiredDocumentsCollection })
      .where(({ docs }) => eq(docs.projectId, projectId)),
  );

  const sortedData = [...data];

  return { documents: sortedData, isLoading, isError };
};

/**
 * Builds a hierarchical required-documents tree from the flat per-project collection.
 * Sorts categories alphabetically, renders custom last, and sorts document
 * types alphabetically within each category for stable UI ordering.
 */
export const useRequiredDocumentsTree = (projectId: string) => {
  const { documents, isLoading, isError } = useAllRequiredDocuments(projectId);
  const categories = getOrderedCategories(documents);
  const nonCategories = documents.filter((doc) => !doc.isCategory);
  const byParentId = new Map<string, RequiredDocument[]>();

  for (const doc of nonCategories) {
    if (!doc.parentId) {
      continue;
    }
    const current = byParentId.get(doc.parentId) ?? [];
    current.push(doc);
    byParentId.set(doc.parentId, current);
  }

  const rootNodes: RequiredDocumentNode[] = categories.flatMap((category) => {
    const children: RequiredDocumentNode[] = (byParentId.get(category.id) ?? [])
      .sort(compareByName)
      .map((doc) => ({
        id: doc.id,
        name: doc.name,
        isResolved: doc.isResolved,
      }));

    if (children.length === 0 && !isCustomCategory(category)) {
      return [];
    }

    return [
      {
        id: category.id,
        name: category.name,
        children,
      },
    ];
  });

  return { tree: rootNodes, isLoading, isError };
};

export const useAvailableDocumentTypes = (projectId: string) => {
  const { documentTypes, isLoading, isError } =
    useRequiredDocumentTypes(projectId);

  const types = documentTypes.map((documentType) => ({
    id: documentType.id,
    name: documentType.name,
  }));

  return { documentTypes: types, isLoading, isError };
};
