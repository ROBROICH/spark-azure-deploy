type DocumentFileLike = {
  id: string;
  filename: string;
};

type BuildDocumentFileTreeOptions = {
  collapseCommonRoot?: boolean;
  rootLabel?: string;
};

export type DocumentFileTreeFolder<TDocument extends DocumentFileLike> = {
  id: string;
  name: string;
  path: string;
  children: DocumentFileTreeNode<TDocument>[];
};

export type DocumentFileTreeNode<TDocument extends DocumentFileLike> =
  | DocumentFileTreeFolder<TDocument>
  | TDocument;

export const isDocumentFileTreeFolder = <TDocument extends DocumentFileLike>(
  node: DocumentFileTreeNode<TDocument>,
): node is DocumentFileTreeFolder<TDocument> => {
  return 'children' in node;
};

const getDocumentLeafName = <TDocument extends DocumentFileLike>(
  document: TDocument,
) => {
  return document.filename.split('/').pop() ?? document.filename;
};

const sortTree = <TDocument extends DocumentFileLike>(
  folder: DocumentFileTreeFolder<TDocument>,
): DocumentFileTreeFolder<TDocument> => {
  folder.children.sort((left, right) => {
    const leftIsFolder = isDocumentFileTreeFolder(left);
    const rightIsFolder = isDocumentFileTreeFolder(right);

    if (leftIsFolder && !rightIsFolder) {
      return -1;
    }
    if (!leftIsFolder && rightIsFolder) {
      return 1;
    }

    const leftName = leftIsFolder ? left.name : getDocumentLeafName(left);
    const rightName = rightIsFolder ? right.name : getDocumentLeafName(right);

    return leftName.localeCompare(rightName, 'de');
  });

  folder.children.forEach((child) => {
    if (isDocumentFileTreeFolder(child)) {
      sortTree(child);
    }
  });

  return folder;
};

const ensureFolder = <TDocument extends DocumentFileLike>(params: {
  folderId: string;
  folderName: string;
  parentId: string;
  folderIndex: Map<string, DocumentFileTreeFolder<TDocument>>;
}) => {
  const { folderId, folderName, parentId, folderIndex } = params;
  const existingFolder = folderIndex.get(folderId);
  if (existingFolder) {
    return existingFolder;
  }

  const folder: DocumentFileTreeFolder<TDocument> = {
    id: folderId,
    name: folderName,
    path: folderId.replace(/^folder:/, ''),
    children: [],
  };

  folderIndex.set(folderId, folder);
  folderIndex.get(parentId)?.children.push(folder);
  return folder;
};

/**
 * Builds a folder/document tree from flat documents keyed by `filename`.
 */
export const buildDocumentFileTree = <TDocument extends DocumentFileLike>(
  documents: TDocument[],
  options: BuildDocumentFileTreeOptions = {},
): DocumentFileTreeFolder<TDocument> => {
  const { collapseCommonRoot = true, rootLabel = 'Documents' } = options;
  const firstSegments = documents.map(
    (document) => document.filename.split('/')[0] ?? document.filename,
  );
  const commonRoot =
    collapseCommonRoot &&
    firstSegments.length > 0 &&
    firstSegments.every((segment) => segment === firstSegments[0])
      ? firstSegments[0]
      : undefined;
  const rootName = commonRoot ?? rootLabel;

  const root: DocumentFileTreeFolder<TDocument> = {
    id: 'root',
    name: rootName,
    path: '',
    children: [],
  };

  const folderIndex = new Map<string, DocumentFileTreeFolder<TDocument>>([
    ['root', root],
  ]);

  for (const document of documents) {
    const pathParts = document.filename.split('/').filter(Boolean);
    const relativeParts =
      commonRoot !== undefined && pathParts[0] === commonRoot
        ? pathParts.slice(1)
        : pathParts;

    if (relativeParts.length === 0) {
      root.children.push(document);
      continue;
    }

    const folderParts = relativeParts.slice(0, -1);
    let parentId = 'root';

    for (const [index, folderName] of folderParts.entries()) {
      const folderPath = folderParts.slice(0, index + 1).join('/');
      const folderId = `folder:${folderPath}`;

      ensureFolder({
        folderId,
        folderName,
        parentId,
        folderIndex,
      });
      parentId = folderId;
    }

    const parentFolder = folderIndex.get(parentId) ?? root;
    parentFolder.children.push(document);
  }

  return sortTree(root);
};
