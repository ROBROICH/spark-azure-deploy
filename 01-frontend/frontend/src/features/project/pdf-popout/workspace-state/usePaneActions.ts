import type { Dispatch, SetStateAction } from 'react';
import {
  addOrReplacePdfPane,
  addPdfPane,
  closePdfPane,
  setPdfPaneDocument,
  type PdfPane,
} from '../pdfPopout.logic';

type UsePaneActionsParams = {
  panes: PdfPane[];
  setPanes: Dispatch<SetStateAction<PdfPane[]>>;
  connectedFileId: string | undefined;
  maxManualLanes: number;
  trackRecentFile: (fileId: string) => void;
  onConnectedPaneSelect: (fileId: string) => void;
};

/**
 * Pane CRUD callbacks for the popout workspace. Delegates connected-pane
 * document selection back to the caller via `onConnectedPaneSelect` so the
 * workspace composer can coordinate with inline visibility and scope state.
 *
 * @param params Pane state, responsive limits, and cross-cutting callbacks.
 * @returns Action callbacks for adding, closing, and switching pane documents.
 */
export const usePaneActions = (params: UsePaneActionsParams) => {
  const {
    panes,
    setPanes,
    connectedFileId,
    maxManualLanes,
    trackRecentFile,
    onConnectedPaneSelect,
  } = params;

  const addPane = (documentId?: string) => {
    setPanes((prev: PdfPane[]) =>
      addPdfPane(prev, documentId ?? connectedFileId),
    );
  };

  const addLaneFromSidebar = (documentId: string) => {
    trackRecentFile(documentId);
    setPanes((prev: PdfPane[]) =>
      addOrReplacePdfPane(prev, documentId, maxManualLanes),
    );
  };

  const closePane = (paneId: string) => {
    setPanes((prev: PdfPane[]) => closePdfPane(prev, paneId));
  };

  const selectPaneDocument = (paneId: string, documentId: string) => {
    const pane = panes.find((entry) => entry.id === paneId);
    if (!pane) {
      return;
    }

    trackRecentFile(documentId);

    if (pane.connected) {
      onConnectedPaneSelect(documentId);
      return;
    }

    setPanes((prev: PdfPane[]) => setPdfPaneDocument(prev, paneId, documentId));
  };

  return { addPane, addLaneFromSidebar, closePane, selectPaneDocument };
};
