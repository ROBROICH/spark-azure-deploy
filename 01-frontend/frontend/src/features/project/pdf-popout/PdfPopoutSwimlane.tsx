import { PdfCollapsedLane } from '@/features/project/pdf-popout/popout/PdfCollapsedLane';
import { PdfFileTreePopover } from '@/features/project/pdf-popout/file-tree/PdfFileTreePopover';
import { usePdfPopout } from '@/features/project/pdf-popout/PdfPopoutWorkspaceContext';
import { PdfViewerPane } from '@/features/project/pdf-popout/viewer/PdfViewerPane';
import { Button } from '@/features/ui/button/Button';
import { SwimlaneHeader } from '@/features/ui/swimlane-header/SwimlaneHeader';
import { SwimlanesLaneHeaderOverrideContext } from '@/features/ui/swimlanes/SwimlanesContext';
import { cn } from '@/features/ui/style/cn';
import { ExternalLink, FileText } from 'lucide-react';
import { useCallback, useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

const LANE_TRANSITION =
  'flex-grow 500ms ease-in-out, flex-shrink 500ms ease-in-out, flex-basis 500ms ease-in-out, max-width 500ms ease-in-out';

const COLLAPSED_STYLE: React.CSSProperties = {
  flexGrow: 0,
  flexShrink: 0,
  flexBasis: '52px',
  maxWidth: '52px',
  overflow: 'hidden',
  transition: LANE_TRANSITION,
};

const EXPANDED_STYLE: React.CSSProperties = {
  flexGrow: 1,
  flexShrink: 1,
  flexBasis: '0%',
  maxWidth: '9999px',
  overflow: 'hidden',
  transition: LANE_TRANSITION,
};

type PdfPopoutSwimlaneHeaderProps = {
  headingId: string;
  headerPortalTarget: HTMLDivElement | null;
  setHeaderPortalTarget: (target: HTMLDivElement | null) => void;
};

const PdfPopoutSwimlaneHeader = (props: PdfPopoutSwimlaneHeaderProps) => {
  const { headingId, headerPortalTarget, setHeaderPortalTarget } = props;
  const { t } = useTranslation('PdfPopout');
  const {
    tree,
    isLoadingFiles,
    isFilesError,
    filePagination,
    connectedFileId,
    documentPreviewById,
    popOut,
    selectPaneDocument,
    requestFileCatalog,
  } = usePdfPopout();
  const title =
    (connectedFileId
      ? documentPreviewById.get(connectedFileId)?.title
      : undefined) ?? t('PdfViewerLane.selectFileFallback');
  const hasHeaderOverride = headerPortalTarget !== null;

  return (
    <SwimlaneHeader
      icon={FileText}
      title={t('PdfViewerLane.title')}
      headingId={headingId}
      hasOverrideContent={hasHeaderOverride}
      overrideContent={
        <div
          ref={setHeaderPortalTarget}
          className={hasHeaderOverride ? 'contents' : 'hidden'}
        />
      }
    >
      <span className="max-w-[220px] truncate text-[11px] leading-[14px] font-normal text-text-secondary">
        {title}
      </span>
      <div className="flex items-center gap-1">
        <PdfFileTreePopover
          isLoading={isLoadingFiles}
          isError={isFilesError}
          nodes={tree}
          pagination={filePagination}
          selectedDocumentId={connectedFileId}
          onRequestFiles={requestFileCatalog}
          onSelectDocument={(documentId) =>
            selectPaneDocument('connected-pane', documentId)
          }
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t('PdfViewerPane.popOutAria', { title })}
          onClick={popOut}
        >
          <ExternalLink />
        </Button>
      </div>
    </SwimlaneHeader>
  );
};

export const PdfPopoutSwimlane = () => {
  const { t } = useTranslation('PdfPopout');
  const headingId = useId();
  const { isPoppedOut, connectedFileId } = usePdfPopout();
  const [headerPortalTarget, setHeaderPortalTarget] =
    // eslint-disable-next-line no-restricted-syntax -- portal DOM target is a transient reference to a rendered node, not URL-worthy state
    useState<HTMLDivElement | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- transient count of mounted header-override portals, not URL-worthy state
  const [headerOverrideCount, setHeaderOverrideCount] = useState(0);

  // eslint-disable-next-line no-restricted-syntax -- the portal registration callbacks must stay stable so the header portal effect does not tear down and re-register on unrelated lane renders
  const registerHeaderOverride = useCallback(() => {
    setHeaderOverrideCount((currentCount) => currentCount + 1);
  }, []);

  // eslint-disable-next-line no-restricted-syntax -- the portal registration callbacks must stay stable so the header portal effect does not tear down and re-register on unrelated lane renders
  const unregisterHeaderOverride = useCallback(() => {
    setHeaderOverrideCount((currentCount) => Math.max(0, currentCount - 1));
  }, []);

  // eslint-disable-next-line no-restricted-syntax -- portal consumers rely on a stable context value until the header target or registration callbacks change
  const headerOverrideContextValue = useMemo(
    () => ({
      headerPortalTarget,
      registerHeaderOverride,
      unregisterHeaderOverride,
    }),
    [headerPortalTarget, registerHeaderOverride, unregisterHeaderOverride],
  );

  return (
    <SwimlanesLaneHeaderOverrideContext.Provider
      value={headerOverrideContextValue}
    >
      <section
        aria-labelledby={headingId}
        className={cn(
          'flex min-h-0 min-w-0 flex-1 flex-col bg-white',
          !isPoppedOut && 'min-w-[var(--swimlane-min-w)]',
        )}
        style={isPoppedOut ? COLLAPSED_STYLE : EXPANDED_STYLE}
      >
        {!isPoppedOut ? (
          <PdfPopoutSwimlaneHeader
            headingId={headingId}
            headerPortalTarget={
              headerOverrideCount > 0 ? headerPortalTarget : null
            }
            setHeaderPortalTarget={setHeaderPortalTarget}
          />
        ) : (
          <h2 id={headingId} className="sr-only">
            {t('PdfViewerLane.title')}
          </h2>
        )}
        <div className="min-h-0 flex-1 overflow-auto">
          {isPoppedOut ? (
            <PdfCollapsedLane />
          ) : (
            <PdfViewerPane
              documentId={connectedFileId}
              className="h-full"
              flush
              connected
            />
          )}
        </div>
      </section>
    </SwimlanesLaneHeaderOverrideContext.Provider>
  );
};
