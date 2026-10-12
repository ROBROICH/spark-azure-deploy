import { SafePdfIframe } from '@/features/shared/remote-files/SafePdfIframe';
import {
  toSafePdfIframeSrc,
  type SafeDownloadUrlString,
} from '@/features/shared/remote-files/downloadUrlSafety';
import { cn } from '@/features/ui/style/cn';
import { useTranslation } from 'react-i18next';
import { useReducer } from 'react';
import {
  PdfBlankSurface,
  PdfPlaceholder,
} from './PdfIframeDocumentViewerSurfaces';

type PdfIframeDocumentViewerProps = {
  fileUrl?: string;
  documentId?: string;
  documentTitle?: string;
  isLoading?: boolean;
  isPdf?: boolean;
  hasFileUrlError?: boolean;
  hasDocumentNotFound?: boolean;
  flush?: boolean;
  requestedPageNumber?: number;
  requestedPageJumpKey?: number;
};

type BufferedIframeState = {
  key: string;
  src: SafeDownloadUrlString;
  title: string;
};

type ViewerRuntimeState = {
  activeFrame: BufferedIframeState | null;
  documentId: string | undefined;
  handledPageJumpKey: number | undefined;
  pageNumber: number;
  pendingFrame: BufferedIframeState | null;
};

const DEFAULT_PAGE_NUMBER = 1;

const getFrameKey = (
  documentId: string | undefined,
  pageNumber: number,
  requestKey: number | undefined,
) => `${documentId ?? 'no-document'}:${pageNumber}:${requestKey ?? 'initial'}`;

const createInitialViewerState = (props: {
  documentId: string | undefined;
}): ViewerRuntimeState => ({
  activeFrame: null,
  documentId: props.documentId,
  handledPageJumpKey: undefined,
  pageNumber: DEFAULT_PAGE_NUMBER,
  pendingFrame: null,
});

const replaceViewerRuntimeState = (
  _state: ViewerRuntimeState,
  nextState: ViewerRuntimeState,
) => nextState;

/** Resolves active and hidden iframe frames from render inputs. */
const getBufferedFramesForRender = (params: {
  currentActiveFrame: BufferedIframeState | null;
  currentPendingFrame: BufferedIframeState | null;
  desiredFrame: BufferedIframeState | null;
  hasBlockingState: boolean;
  isLoading: boolean;
}) => {
  const {
    currentActiveFrame,
    currentPendingFrame,
    desiredFrame,
    hasBlockingState,
    isLoading,
  } = params;

  if (hasBlockingState || (desiredFrame === null && !isLoading)) {
    return { activeFrame: null, pendingFrame: null };
  }

  if (desiredFrame === null) {
    return { activeFrame: currentActiveFrame, pendingFrame: null };
  }

  if (currentActiveFrame === null) {
    return { activeFrame: desiredFrame, pendingFrame: null };
  }

  if (
    currentActiveFrame.key === desiredFrame.key &&
    currentActiveFrame.src === desiredFrame.src
  ) {
    return { activeFrame: currentActiveFrame, pendingFrame: null };
  }

  if (
    currentPendingFrame?.key === desiredFrame.key &&
    currentPendingFrame.src === desiredFrame.src
  ) {
    return {
      activeFrame: currentActiveFrame,
      pendingFrame: currentPendingFrame,
    };
  }

  return { activeFrame: currentActiveFrame, pendingFrame: desiredFrame };
};

const haveBufferedFramesChanged = (
  current: Pick<ViewerRuntimeState, 'activeFrame' | 'pendingFrame'>,
  next: Pick<ViewerRuntimeState, 'activeFrame' | 'pendingFrame'>,
) =>
  current.activeFrame !== next.activeFrame ||
  current.pendingFrame !== next.pendingFrame;

const getPageJumpState = (params: {
  currentState: ViewerRuntimeState;
  pageNumber: number | undefined;
  requestKey: number | undefined;
}) => {
  const { currentState, pageNumber, requestKey } = params;

  if (
    pageNumber === undefined ||
    requestKey === undefined ||
    currentState.handledPageJumpKey === requestKey
  ) {
    return currentState;
  }

  return {
    ...currentState,
    handledPageJumpKey: requestKey,
    pageNumber,
  };
};

/**
 * Lightweight iframe-backed PDF preview.
 */
export const PdfIframeDocumentViewer = (
  props: PdfIframeDocumentViewerProps,
) => {
  const {
    fileUrl,
    documentId,
    documentTitle,
    isLoading = false,
    isPdf = true,
    hasFileUrlError = false,
    hasDocumentNotFound = false,
    flush = false,
    requestedPageNumber,
    requestedPageJumpKey,
  } = props;
  const { t } = useTranslation('PdfPopout');
  const [viewerState, setViewerState] = useReducer(
    replaceViewerRuntimeState,
    { documentId },
    createInitialViewerState,
  );
  let nextViewerState = viewerState;

  if (
    documentId !== nextViewerState.documentId ||
    (requestedPageJumpKey === undefined &&
      nextViewerState.handledPageJumpKey !== undefined)
  ) {
    nextViewerState = {
      ...nextViewerState,
      documentId,
      handledPageJumpKey: undefined,
      pageNumber: DEFAULT_PAGE_NUMBER,
      pendingFrame: null,
    };
  }

  nextViewerState = getPageJumpState({
    currentState: nextViewerState,
    pageNumber: requestedPageNumber,
    requestKey: requestedPageJumpKey,
  });

  const frameTitle = documentTitle
    ? t('PdfDocumentViewer.frameTitle', { title: documentTitle })
    : t('PdfViewerLane.title');
  const safeFrameSrc = toSafePdfIframeSrc(fileUrl, nextViewerState.pageNumber);
  const hasUnsafeFileUrl = Boolean(fileUrl) && !safeFrameSrc;
  const hasBlockingState =
    hasFileUrlError || hasDocumentNotFound || !isPdf || hasUnsafeFileUrl;
  const desiredFrame =
    safeFrameSrc && isPdf && !hasFileUrlError && !isLoading
      ? ({
          key: getFrameKey(
            documentId,
            nextViewerState.pageNumber,
            nextViewerState.handledPageJumpKey,
          ),
          src: safeFrameSrc,
          title: frameTitle,
        } satisfies BufferedIframeState)
      : null;
  const nextBufferedFrames = getBufferedFramesForRender({
    currentActiveFrame: nextViewerState.activeFrame,
    currentPendingFrame: nextViewerState.pendingFrame,
    desiredFrame,
    hasBlockingState,
    isLoading,
  });

  if (haveBufferedFramesChanged(nextViewerState, nextBufferedFrames)) {
    nextViewerState = {
      ...nextViewerState,
      activeFrame: nextBufferedFrames.activeFrame,
      pendingFrame: nextBufferedFrames.pendingFrame,
    };
  }

  if (nextViewerState !== viewerState) {
    setViewerState(nextViewerState);
  }

  const promotePendingFrame = (loadedFrame: BufferedIframeState) => {
    if (viewerState.pendingFrame?.key !== loadedFrame.key) {
      return;
    }
    setViewerState({
      ...viewerState,
      activeFrame: loadedFrame,
      pendingFrame: null,
    });
  };

  if (hasFileUrlError || hasUnsafeFileUrl) {
    return <PdfPlaceholder>{t('PdfDocumentViewer.loadError')}</PdfPlaceholder>;
  }

  if (hasDocumentNotFound) {
    return <PdfPlaceholder>{t('PdfDocumentViewer.notFound')}</PdfPlaceholder>;
  }

  if (isLoading && nextViewerState.activeFrame === null) {
    return <PdfBlankSurface flush={flush} />;
  }

  if (!fileUrl && nextViewerState.activeFrame === null) {
    return <PdfPlaceholder>{t('PdfDocumentViewer.emptyState')}</PdfPlaceholder>;
  }

  if (!isPdf) {
    return (
      <PdfPlaceholder>{t('PdfDocumentViewer.nonPdfError')}</PdfPlaceholder>
    );
  }

  const activeFrame = nextViewerState.activeFrame;
  const pendingFrame = nextViewerState.pendingFrame;

  return (
    <div
      className={cn(
        'relative flex h-full flex-col overflow-hidden bg-[#334155]',
        !flush && 'rounded-lg border border-border-primary',
      )}
    >
      {activeFrame ? (
        <SafePdfIframe
          key={activeFrame.key}
          title={activeFrame.title}
          src={activeFrame.src}
          onLoad={() => promotePendingFrame(activeFrame)}
          className="block h-full min-h-0 w-full min-w-0 flex-1 overflow-hidden border-0 bg-white"
        />
      ) : null}
      {pendingFrame ? (
        <SafePdfIframe
          key={pendingFrame.key}
          title={pendingFrame.title}
          src={pendingFrame.src}
          onLoad={() => promotePendingFrame(pendingFrame)}
          aria-hidden="true"
          tabIndex={-1}
          className="pointer-events-none absolute inset-0 block h-full w-full min-w-0 overflow-hidden border-0 opacity-0"
        />
      ) : null}
    </div>
  );
};
