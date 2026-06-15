type Pane = {
  id: string;
  documentId?: string;
};

type SidebarPaneMappingParams = {
  panes: Pane[];
  connectedFileId?: string;
  closePane: (paneId: string) => void;
};

/**
 * Derives the set of open document IDs and a close-by-document helper
 * from the current pane list for use in the sidebar file tree.
 *
 * @param params Current panes, connected document ID, and close callback.
 * @returns openDocumentIds Set and a closeLaneByDocumentId callback.
 */
export const useSidebarPaneMapping = (params: SidebarPaneMappingParams) => {
  const { panes, connectedFileId, closePane } = params;

  const openDocumentIds = (() => {
    const ids = new Set(
      panes.flatMap((pane) => (pane.documentId ? [pane.documentId] : [])),
    );

    if (connectedFileId) {
      ids.add(connectedFileId);
    }

    return ids;
  })();

  const paneIdByDocumentId = new Map(
    panes.flatMap((pane) =>
      pane.documentId ? [[pane.documentId, pane.id]] : [],
    ),
  );

  const closeLaneByDocumentId = (documentId: string) => {
    const paneId = paneIdByDocumentId.get(documentId);
    if (paneId) {
      closePane(paneId);
    }
  };

  return { openDocumentIds, closeLaneByDocumentId };
};
