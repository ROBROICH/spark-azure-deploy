import { useTranslation } from 'react-i18next';
import { Button } from '@/features/ui/button/Button';
import { File, Minimize2, X } from 'lucide-react';
import { PdfDarkFileTreeDropdown } from '../file-tree/PdfDarkFileTreeDropdown';
import { usePdfPopout } from '../PdfPopoutWorkspaceContext';

type PdfPopoutPaneHeaderProps = {
  paneId: string;
  documentId?: string;
  connected: boolean;
};

const ConnectedPaneHeader = (props: { documentId?: string }) => {
  const { documentId } = props;
  const { t } = useTranslation('PdfPopout');
  const { documentPreviewById, popIn } = usePdfPopout();
  const title =
    (documentId ? documentPreviewById.get(documentId)?.title : undefined) ??
    t('PdfPopoutPaneHeader.connectedFallbackTitle');

  return (
    <div className="flex items-center gap-2 border-b border-border-primary px-3 py-2">
      <span aria-hidden="true" className="rounded-lg bg-bg-quaternary p-2">
        <File className="size-4" />
      </span>
      <p className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-[-0.13px] text-brand-950">
        {title}
      </p>
      <span className="shrink-0 rounded border-[0.5px] border-slate-400 px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-600">
        {t('PdfPopoutPaneHeader.connectedBadge')}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={t('PdfPopoutPaneHeader.minimizeAria')}
        onClick={popIn}
      >
        <Minimize2 />
      </Button>
    </div>
  );
};

const SecondaryPaneHeader = (props: {
  paneId: string;
  documentId?: string;
}) => {
  const { paneId, documentId } = props;
  const { t } = useTranslation('PdfPopout');
  const { documentPreviewById, closePane } = usePdfPopout();
  const title =
    (documentId ? documentPreviewById.get(documentId)?.title : undefined) ??
    t('PdfPopoutPaneHeader.defaultFallbackTitle');

  return (
    <div className="flex items-center gap-2 border-b border-border-primary px-3 py-2">
      <span aria-hidden="true" className="rounded-lg bg-bg-quaternary p-2">
        <File className="size-4" />
      </span>
      <PdfDarkFileTreeDropdown
        paneId={paneId}
        documentId={documentId}
        title={title}
      />
      <div className="flex-1" />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        iconOnly
        aria-label={t('PdfPopoutPaneHeader.closePaneAria')}
        onClick={() => closePane(paneId)}
      >
        <X />
      </Button>
    </div>
  );
};

export const PdfPopoutPaneHeader = (props: PdfPopoutPaneHeaderProps) => {
  const { paneId, documentId, connected } = props;

  if (connected) {
    return <ConnectedPaneHeader documentId={documentId} />;
  }

  return <SecondaryPaneHeader paneId={paneId} documentId={documentId} />;
};
