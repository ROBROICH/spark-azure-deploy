import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { PdfPopoutPaneHeader } from './PdfPopoutPaneHeader';
import { usePdfPopout } from '../PdfPopoutWorkspaceContext';
import { PdfPopoutSidebar } from './PdfPopoutSidebar';
import { PdfViewerPane } from '../viewer/PdfViewerPane';

type PdfPopoutPaneSlotProps = {
  header: React.ReactNode;
  viewer: React.ReactNode;
};

const PdfPopoutPaneSlot = (props: PdfPopoutPaneSlotProps) => {
  const { header, viewer } = props;

  return (
    <div className="flex min-w-[330px] flex-1 flex-col bg-neutral-white">
      {header}
      <div className="min-h-0 flex-1">{viewer}</div>
    </div>
  );
};

export const PdfPopoutWorkspaceWindow = () => {
  const { t } = useTranslation('PdfPopout');
  const { popupRoot, panes, scopeKey, connectedFileId } = usePdfPopout();

  if (!popupRoot) {
    return null;
  }

  const connectedPane = panes.find((pane) => pane.connected);
  const manualPanes = panes.filter((pane) => !pane.connected);
  const connectedPaneDocumentId = connectedFileId ?? connectedPane?.documentId;

  return createPortal(
    scopeKey ? (
      <div className="flex h-full overflow-x-auto overflow-y-hidden bg-neutral-white">
        <PdfPopoutSidebar />
        <div className="flex flex-1 gap-px bg-border-primary">
          {connectedPane && (
            <PdfPopoutPaneSlot
              header={
                <PdfPopoutPaneHeader
                  paneId={connectedPane.id}
                  documentId={connectedPaneDocumentId}
                  connected
                />
              }
              viewer={
                <PdfViewerPane
                  documentId={connectedPaneDocumentId}
                  className="h-full"
                  flush
                  connected
                />
              }
            />
          )}
          {manualPanes.map((pane) => (
            <PdfPopoutPaneSlot
              key={pane.id}
              header={
                <PdfPopoutPaneHeader
                  paneId={pane.id}
                  documentId={pane.documentId}
                  connected={false}
                />
              }
              viewer={
                <PdfViewerPane
                  documentId={pane.documentId}
                  className="h-full"
                  flush
                />
              }
            />
          ))}
        </div>
      </div>
    ) : (
      <div className="flex h-full w-full items-center justify-center bg-bg-secondary">
        <p className="max-w-md px-6 text-center text-sm text-slate-500">
          {t('PdfPopoutWindow.emptyState')}
        </p>
      </div>
    ),
    popupRoot,
  );
};
