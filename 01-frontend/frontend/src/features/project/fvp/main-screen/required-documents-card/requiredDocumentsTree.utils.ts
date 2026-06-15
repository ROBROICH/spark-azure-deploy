import type { RequiredDocumentNode } from '../data/schemas/requiredDocument.schema';

const CUSTOM_CATEGORY_NAME = 'Benutzerdefiniert';
const CUSTOM_CATEGORY_LABEL = CUSTOM_CATEGORY_NAME.toLowerCase();

const normalizeDocumentTypeName = (value: string) =>
  value.trim().toLocaleLowerCase();

const isCustomCategoryNode = (node: RequiredDocumentNode) => {
  return (
    node.children !== undefined &&
    normalizeDocumentTypeName(node.name) === CUSTOM_CATEGORY_LABEL
  );
};

export const getCustomCategoryId = (
  nodes: RequiredDocumentNode[],
): string | null => {
  const existingCustomCategory = nodes.find(isCustomCategoryNode);

  return existingCustomCategory?.id ?? null;
};

const getCustomDocuments = (nodes: RequiredDocumentNode[]) => {
  const customCategory = nodes.find(isCustomCategoryNode);

  return customCategory?.children ?? [];
};

export const hasDuplicateCustomDocumentName = (
  nodes: RequiredDocumentNode[],
  name: string,
  ignoredId?: string,
) => {
  const normalizedName = normalizeDocumentTypeName(name);

  if (!normalizedName) {
    return false;
  }

  return getCustomDocuments(nodes).some((node) => {
    return (
      node.id !== ignoredId &&
      normalizeDocumentTypeName(node.name) === normalizedName
    );
  });
};

export const updateDocumentNameInTree = (
  nodes: RequiredDocumentNode[],
  id: string,
  name: string,
): RequiredDocumentNode[] => {
  return nodes.map((node) => {
    if (node.id === id) {
      return { ...node, name };
    }

    if (!node.children) {
      return node;
    }

    return {
      ...node,
      children: updateDocumentNameInTree(node.children, id, name),
    };
  });
};

export const removeDocumentFromTree = (
  nodes: RequiredDocumentNode[],
  id: string,
): RequiredDocumentNode[] => {
  return nodes
    .filter((node) => node.id !== id)
    .map((node) => {
      if (!node.children) {
        return node;
      }

      return {
        ...node,
        children: removeDocumentFromTree(node.children, id),
      };
    });
};

export const addDocumentToCustomCategory = (
  nodes: RequiredDocumentNode[],
  newDocument: RequiredDocumentNode,
  customCategoryId: string | null,
): RequiredDocumentNode[] => {
  const customCategoryIndex = nodes.findIndex(isCustomCategoryNode);

  if (customCategoryIndex >= 0) {
    return nodes.map((node, index) => {
      if (index !== customCategoryIndex) {
        return node;
      }

      return {
        ...node,
        children: [...(node.children ?? []), newDocument],
      };
    });
  }

  const customCategory: RequiredDocumentNode = {
    id: customCategoryId ?? crypto.randomUUID(),
    name: CUSTOM_CATEGORY_NAME,
    children: [newDocument],
  };

  return [...nodes, customCategory];
};
