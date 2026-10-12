import { cn } from '@/features/ui/style/cn';
import { useProjectFilePreview } from '@/features/project/data/project-files/useProjectFilePreview';
import { useTranslation } from 'react-i18next';
import { PdfIframeDocumentViewer } from './iframe-viewer/PdfIframeDocumentViewer';
import { usePdfPopout } from '../PdfPopoutWorkspaceContext';

type PdfViewerPaneProps = {
  documentId?: string;
  className?: string;
  flush?: boolean;
  connected?: boolean;
};

export const PdfViewerPane = (props: PdfViewerPaneProps) => {
  const { documentId, className, flush = false, connected = false } = props;
  const { t } = useTranslation('PdfPopout');
  const { projectId, documentPreviewById, connectedFileId, connectedPageJump } =
    usePdfPopout();
  const preview = documentId ? documentPreviewById.get(documentId) : undefined;
  const filePreview = useProjectFilePreview({
    projectId,
    fileId: documentId,
    fallbackTitle:
      preview?.title ?? t('PdfPopoutPaneHeader.defaultFallbackTitle'),
  });
  const isPdf = preview?.isPdf ?? true;
  const requestedPageNumber =
    connected &&
    documentId &&
    connectedFileId === documentId &&
    connectedPageJump?.documentId === documentId
      ? connectedPageJump.pageNumber
      : undefined;
  const requestedPageJumpKey =
    requestedPageNumber !== undefined
      ? connectedPageJump?.requestKey
      : undefined;

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-neutral-white',
        !flush && 'rounded-xl border border-border-primary shadow-sm',
        className,
      )}
    >
      <div className={cn('min-h-0 flex-1', !flush && 'bg-slate-950/5 p-3')}>
        <PdfIframeDocumentViewer
          fileUrl={filePreview.downloadUrl}
          documentId={documentId}
          documentTitle={filePreview.title}
          isLoading={filePreview.isLoading}
          hasFileUrlError={filePreview.isError}
          hasDocumentNotFound={filePreview.isFileNotFound}
          isPdf={isPdf}
          flush={flush}
          requestedPageNumber={requestedPageNumber}
          requestedPageJumpKey={requestedPageJumpKey}
        />
      </div>
    </div>
  );
};
