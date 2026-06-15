import {
  buildDocumentFileTree,
  isDocumentFileTreeFolder,
  type DocumentFileTreeNode,
} from '@/features/project/data/document-file-tree/buildDocumentFileTree';

export type PdfPane = {
  id: string;
  documentId?: string;
  connected: boolean;
};

export type ProjectPdfFile = {
  id: string;
  path: string;
  title: string;
};

export type PdfTreeDocumentNode = {
  kind: 'document';
  id: string;
  title: string;
  path: string;
};

export type PdfTreeFolderNode = {
  kind: 'folder';
  id: string;
  title: string;
  path: string;
  children: PdfTreeNode[];
};

export type PdfTreeNode = PdfTreeFolderNode | PdfTreeDocumentNode;

const normalizePath = (path: string) => path.replace(/^\/+|\/+$/g, '');

type PdfTreeFileDocument = ProjectPdfFile & {
  filename: string;
};

const mapDocumentFileTreeToPdfTree = <
  TDocument extends { id: string; filename: string; title?: string },
>(
  nodes: DocumentFileTreeNode<TDocument>[],
): PdfTreeNode[] =>
  nodes.map((node) => {
    if (!isDocumentFileTreeFolder(node)) {
      return {
        kind: 'document',
        id: node.id,
        title: node.title ?? node.filename.split('/').pop() ?? node.filename,
        path: node.filename,
      };
    }

    return {
      kind: 'folder',
      id: node.id,
      title: node.name,
      path: node.path,
      children: mapDocumentFileTreeToPdfTree(node.children),
    };
  });

/**
 * Builds a dense folder/document tree from raw project file paths so the same
 * structure can drive the inline browser and the detached multi-pane window.
 */
export const buildPdfFileTree = (files: ProjectPdfFile[]) => {
  const documentTree = buildDocumentFileTree<PdfTreeFileDocument>(
    files
      .map((file) => ({
        ...file,
        filename: normalizePath(file.path),
      }))
      .filter((file) => file.filename.length > 0),
    { collapseCommonRoot: false },
  );

  return mapDocumentFileTreeToPdfTree(documentTree.children);
};

export const findPdfFileIdByTitle = (
  files: ProjectPdfFile[],
  title: string,
): string | undefined => {
  const normalizedTitle = title.trim().toLocaleLowerCase('de');
  if (!normalizedTitle) {
    return undefined;
  }

  const exactMatch = files.find(
    (file) => file.title.toLocaleLowerCase('de') === normalizedTitle,
  );
  if (exactMatch) {
    return exactMatch.id;
  }

  const basenameMatch = files.find((file) => {
    const basename = file.path.split('/').pop() ?? file.title;
    return basename.toLocaleLowerCase('de') === normalizedTitle;
  });
  return basenameMatch?.id;
};

export const createInitialPdfPanes = (connectedFileId?: string): PdfPane[] => [
  {
    id: 'connected-pane',
    connected: true,
    documentId: connectedFileId,
  },
];

export const syncConnectedPane = (
  panes: PdfPane[],
  connectedFileId?: string,
): PdfPane[] =>
  panes.map((pane) =>
    pane.connected ? { ...pane, documentId: connectedFileId } : pane,
  );

export const addPdfPane = (
  panes: PdfPane[],
  documentId?: string,
): PdfPane[] => {
  if (panes.length >= 4) {
    return panes;
  }

  return [
    ...panes,
    {
      id: crypto.randomUUID(),
      connected: false,
      documentId,
    },
  ];
};

/**
 * Adds a new manual pane or replaces the last manual pane's document when the
 * limit is reached. Used by the sidebar file tree in the popout window.
 * Returns panes unchanged if the document is already open in any pane.
 *
 * @param panes Current pane list.
 * @param documentId Document to open in the new or replaced pane.
 * @param maxManualPanes Maximum number of manual panes allowed (responsive).
 * @returns Updated pane list.
 */
export const addOrReplacePdfPane = (
  panes: PdfPane[],
  documentId: string,
  maxManualPanes: number,
): PdfPane[] => {
  if (panes.some((pane) => pane.documentId === documentId)) {
    return panes;
  }

  const manualPanes = panes.filter((pane) => !pane.connected);

  if (manualPanes.length < maxManualPanes) {
    return [
      ...panes,
      {
        id: crypto.randomUUID(),
        connected: false,
        documentId,
      },
    ];
  }

  const lastManualPaneId = manualPanes[manualPanes.length - 1]?.id;

  return panes.map((pane) =>
    pane.id === lastManualPaneId ? { ...pane, documentId } : pane,
  );
};

export const closePdfPane = (panes: PdfPane[], paneId: string): PdfPane[] =>
  panes.filter((pane) => pane.connected || pane.id !== paneId);

export const setPdfPaneDocument = (
  panes: PdfPane[],
  paneId: string,
  documentId?: string,
): PdfPane[] =>
  panes.map((pane) => (pane.id === paneId ? { ...pane, documentId } : pane));

export const POPUP_WINDOW_NAME = 'project-pdf-popout-window';

/**
 * Normalises persisted pane data back into a valid runtime shape by capping
 * manual panes and ensuring the connected pane reflects the current connected
 * document. Preserves original pane IDs so React keys stay stable across
 * scope switches.
 *
 * @param panes Raw pane array restored from storage (may be undefined).
 * @param connectedFileId The file currently bound to the connected pane.
 * @returns A sanitised pane list safe to use as component state.
 */
export const sanitizePersistedPanes = (
  panes: PdfPane[] | undefined,
  connectedFileId?: string,
  maxManualPanes = 3,
) => {
  const manualPanes = (panes ?? [])
    .filter((pane) => !pane.connected)
    .slice(0, maxManualPanes)
    .map((pane) => ({
      id: pane.id,
      connected: false,
      documentId: pane.documentId,
    }));

  return syncConnectedPane(
    [
      {
        id: 'connected-pane',
        connected: true,
        documentId: connectedFileId,
      },
      ...manualPanes,
    ],
    connectedFileId,
  );
};

/**
 * Recursively counts document nodes (excludes folders) in a tree.
 *
 * @param nodes Tree to count.
 * @returns Total number of document nodes in the tree.
 */
export const countTreeDocuments = (nodes: PdfTreeNode[]): number =>
  nodes.reduce((count, node) => {
    if (node.kind === 'document') {
      return count + 1;
    }

    return count + countTreeDocuments(node.children);
  }, 0);

/**
 * Recursively filters a tree to only include document nodes whose IDs are in
 * the given set. Folder nodes are kept only when they have at least one
 * matching descendant after filtering.
 *
 * @param nodes Tree to filter.
 * @param documentIds Set of document IDs to keep.
 * @returns A new tree containing only matching documents and their ancestor folders.
 */
export const filterTreeByDocumentIds = (
  nodes: PdfTreeNode[],
  documentIds: Set<string>,
): PdfTreeNode[] =>
  nodes.reduce<PdfTreeNode[]>((result, node) => {
    if (node.kind === 'document') {
      if (documentIds.has(node.id)) {
        result.push(node);
      }

      return result;
    }

    const filteredChildren = filterTreeByDocumentIds(
      node.children,
      documentIds,
    );
    if (filteredChildren.length > 0) {
      result.push({ ...node, children: filteredChildren });
    }

    return result;
  }, []);

/**
 * Shallow-compares two pane arrays by id, connected flag, and documentId so
 * state updates can be skipped when the logical layout has not changed.
 *
 * @param left First pane list.
 * @param right Second pane list.
 * @returns True when both lists describe the same layout.
 */
export const arePanesEqual = (left: PdfPane[], right: PdfPane[]) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((pane, index) => {
    const otherPane = right[index];
    if (!otherPane) {
      return false;
    }

    return (
      pane.id === otherPane.id &&
      pane.connected === otherPane.connected &&
      pane.documentId === otherPane.documentId
    );
  });
};
