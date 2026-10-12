import type {
  DocumentNode,
  DocumentStatus,
  FolderNode,
  TreeNode,
} from './documentTree.types';
import { getFilename, getParentPath, isFolderPath } from './documentTreePath';

/** Minimal document-type reference needed to resolve linked type names. */
type DocumentTypeRef = {
  id: string;
  name: string;
};

type FolderMeta = {
  path: string;
  id: string;
  displayName: string;
  parentPath: string | null;
  depth: number;
  childFolderPaths: string[];
  documentNodes: DocumentNode[];
};

export type DocumentsTreeFile = {
  id: string;
  path: string;
  createdAt?: string;
  linkedDocumentTypeId: string | null;
  linkedDocumentTypeHumanApproved: boolean;
  isDeleted?: boolean;
  confidence?: number | null;
  status?: DocumentStatus;
};

const formatDocCountLabel = (docCount: number) =>
  `${docCount} ${docCount === 1 ? 'Unterlage' : 'Unterlagen'}`;

const buildTypeNameMap = (requiredTypes: DocumentTypeRef[]) => {
  const typeIdToName = new Map<string, string>();
  for (const type of requiredTypes) {
    typeIdToName.set(type.id, type.name);
  }

  return typeIdToName;
};

const createEnsureFolderMeta = (folderMetaByPath: Map<string, FolderMeta>) => {
  /**
   * Recursively creates missing parent folder metadata so every document path can
   * attach to a complete folder chain from the leaf back to the root.
   */
  const ensureFolderMeta = (path: string): FolderMeta => {
    const existing = folderMetaByPath.get(path);
    if (existing) {
      return existing;
    }

    const parentPath = getParentPath(path);
    const meta: FolderMeta = {
      path,
      id: `derived-folder-${path}`,
      displayName: getFilename(path),
      parentPath,
      depth: path.split('/').filter(Boolean).length,
      childFolderPaths: [],
      documentNodes: [],
    };

    folderMetaByPath.set(path, meta);

    if (parentPath) {
      const parentMeta = ensureFolderMeta(parentPath);
      parentMeta.childFolderPaths.push(path);
    }

    return meta;
  };

  return ensureFolderMeta;
};

const getDocumentStatus = (
  file: Pick<DocumentsTreeFile, 'isDeleted' | 'linkedDocumentTypeId'>,
): DocumentStatus => {
  if (file.isDeleted) {
    return 'Gelöscht';
  }

  if (!file.linkedDocumentTypeId) {
    return 'Nicht zugeordnet';
  }

  return 'Zugeordnet';
};

const createDocumentNode = (
  file: DocumentsTreeFile,
  typeIdToName: Map<string, string>,
): DocumentNode => {
  const linkedTypeId = file.linkedDocumentTypeId;
  const linkedTypeName = linkedTypeId
    ? (typeIdToName.get(linkedTypeId) ?? linkedTypeId)
    : undefined;

  return {
    kind: 'document',
    id: file.id,
    filename: getFilename(file.path),
    createdAt: file.createdAt,
    status: file.status ?? getDocumentStatus(file),
    linkedDocumentType:
      linkedTypeId && linkedTypeName
        ? {
            id: linkedTypeId,
            name: linkedTypeName,
            humanApproved: file.linkedDocumentTypeHumanApproved,
          }
        : undefined,
    localFilePath: undefined,
    isDeleted: file.isDeleted,
    confidence: file.confidence,
  };
};

const sortFoldersByDepthAndPath = (folders: FolderMeta[]) =>
  [...folders].sort((a, b) => {
    if (a.depth !== b.depth) {
      return a.depth - b.depth;
    }

    return a.path.localeCompare(b.path, undefined, { numeric: true });
  });

const createFolderNodes = (sortedFolders: FolderMeta[]) => {
  const folderNodes = new Map<string, FolderNode>();
  for (const folder of sortedFolders) {
    folderNodes.set(folder.path, {
      kind: 'folder',
      id: folder.id,
      path: folder.path,
      title: folder.displayName,
      children: [...folder.documentNodes],
    });
  }

  return folderNodes;
};

const attachFolderChildren = (
  sortedFolders: FolderMeta[],
  folderNodes: Map<string, FolderNode>,
) => {
  for (const folder of sortedFolders) {
    const parentNode =
      folder.parentPath === null
        ? undefined
        : folderNodes.get(folder.parentPath);
    const node = folderNodes.get(folder.path);
    if (!parentNode || !node) {
      continue;
    }

    parentNode.children.push(node);
  }
};

/**
 * Sorts every folder's children so folders come first and both folders and
 * documents stay in a stable locale-aware order.
 *
 * @param folderNodes Folder nodes keyed by their path.
 * @returns Nothing. The folder nodes are sorted in place.
 */
const sortFolderChildren = (folderNodes: Map<string, FolderNode>) => {
  for (const folderNode of folderNodes.values()) {
    folderNode.children.sort((a, b) => {
      if (a.kind !== b.kind) {
        return a.kind === 'folder' ? -1 : 1;
      }

      const titleA = a.kind === 'folder' ? a.title : a.filename;
      const titleB = b.kind === 'folder' ? b.title : b.filename;
      return titleA.localeCompare(titleB, undefined, { numeric: true });
    });
  }
};

const getRootNodes = (
  sortedFolders: FolderMeta[],
  folderNodes: Map<string, FolderNode>,
) => {
  const rootNodes: FolderNode[] = [];
  for (const folder of sortedFolders) {
    if (folder.parentPath && folderNodes.has(folder.parentPath)) {
      continue;
    }

    const rootNode = folderNodes.get(folder.path);
    if (rootNode) {
      rootNodes.push(rootNode);
    }
  }

  return rootNodes;
};

const compareTreeNodes = (a: TreeNode, b: TreeNode) => {
  if (a.kind !== b.kind) {
    return a.kind === 'folder' ? -1 : 1;
  }

  const titleA = a.kind === 'folder' ? a.title : a.filename;
  const titleB = b.kind === 'folder' ? b.title : b.filename;
  return titleA.localeCompare(titleB, undefined, { numeric: true });
};

/**
 * Recursively counts document descendants for a folder and stores the aggregate
 * count on each visited folder node before returning that count to the parent.
 */
const setFolderStatusText = (node: FolderNode): number => {
  let docCount = 0;
  for (const child of node.children) {
    if (child.kind === 'document') {
      docCount += 1;
    } else {
      docCount += setFolderStatusText(child);
    }
  }
  node.statusText = formatDocCountLabel(docCount);
  return docCount;
};

export const buildDocumentsTree = (
  files: DocumentsTreeFile[],
  requiredTypes: DocumentTypeRef[],
) => {
  const typeIdToName = buildTypeNameMap(requiredTypes);
  const folderMetaByPath = new Map<string, FolderMeta>();
  const ensureFolderMeta = createEnsureFolderMeta(folderMetaByPath);
  const rootDocumentNodes: DocumentNode[] = [];

  for (const file of files) {
    if (isFolderPath(file.path)) {
      continue;
    }

    const directParentPath = getParentPath(file.path);
    if (!directParentPath) {
      rootDocumentNodes.push(createDocumentNode(file, typeIdToName));
      continue;
    }

    const folderMeta = ensureFolderMeta(directParentPath);
    folderMeta.documentNodes.push(createDocumentNode(file, typeIdToName));
  }

  const sortedFolders = sortFoldersByDepthAndPath(
    Array.from(folderMetaByPath.values()),
  );
  const folderNodes = createFolderNodes(sortedFolders);
  attachFolderChildren(sortedFolders, folderNodes);
  sortFolderChildren(folderNodes);

  const rootNodes = getRootNodes(sortedFolders, folderNodes);
  for (const rootNode of rootNodes) {
    setFolderStatusText(rootNode);
  }

  return [...rootNodes, ...rootDocumentNodes].sort(compareTreeNodes);
};
