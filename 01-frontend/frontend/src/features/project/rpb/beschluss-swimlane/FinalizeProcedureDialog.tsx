import {
  exportVaeDocxProjectIdExportDocxPost,
  exportVaePdfProjectIdExportPdfPost,
} from '@/api-clients/vae-module';
import {
  createLocalPdfPreviewUrl,
  revokeLocalPdfPreviewUrl,
  type LocalPdfPreviewUrlString,
} from '@/features/shared/remote-files/downloadUrlSafety';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { getRouteApi } from '@tanstack/react-router';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FinalizeProcedureDialogFooter } from './FinalizeProcedureDialogFooter';
import { FinalizeProcedureDialogInfoRail } from './FinalizeProcedureDialogInfoRail';
import { FinalizeProcedureDialogPreviewPane } from './FinalizeProcedureDialogPreviewPane';
import { downloadFinalizedProcedureBlob } from './finalizeProcedureDownload';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');
const FinalExportConfetti = lazy(() => import('./FinalExportConfetti'));

type FinalizeProcedureDialogProps = {
  onOpenChange: (open: boolean) => void;
};

const assertExportBlob = (data: unknown): Blob => {
  if (data instanceof Blob) {
    return data;
  }

  throw new Error('VAE export response did not return a Blob');
};

/**
 * Export dialog shown from the RPB resolution editor action.
 *
 * It fetches a live PDF preview plus PDF and DOCX exports from the generated VAE client
 * while keeping all request state local to the current modal session.
 */
export const FinalizeProcedureDialog = (
  props: FinalizeProcedureDialogProps,
) => {
  const { onOpenChange } = props;
  const { verfahrenId } = route.useParams();
  const { t } = useTranslation('Rpb');
  // eslint-disable-next-line no-restricted-syntax -- blob preview URL is ephemeral dialog UI state that should not be persisted in the route
  const [previewUrl, setPreviewUrl] = useState<LocalPdfPreviewUrlString | null>(
    null,
  );
  // eslint-disable-next-line no-restricted-syntax -- preview fetch progress is local to this modal session
  const [isPreviewLoading, setIsPreviewLoading] = useState(true);
  // eslint-disable-next-line no-restricted-syntax -- preview request failures are local to this modal session
  const [hasPreviewError, setHasPreviewError] = useState(false);
  // eslint-disable-next-line no-restricted-syntax -- export button progress is local to this modal session
  const [activeDownloadFormat, setActiveDownloadFormat] = useState<
    'pdf' | 'docx' | null
  >(null);
  // eslint-disable-next-line no-restricted-syntax -- export failures are local to this modal session
  const [downloadErrorFormat, setDownloadErrorFormat] = useState<
    'pdf' | 'docx' | null
  >(null);
  const [isDownloadConfettiPlaying, setIsDownloadConfettiPlaying] =
    useState(false); // eslint-disable-line no-restricted-syntax -- animation visibility is local to the lazy-loaded confetti effect.
  const previewUrlRef = useRef<LocalPdfPreviewUrlString | null>(null);
  const isDialogOpenRef = useRef(true);
  const hasStartedDownloadConfettiRef = useRef(false);

  const playDownloadConfettiOnce = () => {
    if (hasStartedDownloadConfettiRef.current) {
      return;
    }

    hasStartedDownloadConfettiRef.current = true;
    setIsDownloadConfettiPlaying(true);
  };
  /**
   * Loads the exported PDF blob when the dialog mounts and manages object URL
   * cleanup so the iframe can render a stable preview without leaking memory.
   */
  // eslint-disable-next-line no-restricted-syntax -- preview export is an external side effect tied to dialog mount/unmount; the updates represent separate async preview states.
  useEffect(() => {
    let isCancelled = false;

    const setNextPreviewUrl = (nextUrl: LocalPdfPreviewUrlString | null) => {
      if (previewUrlRef.current) {
        revokeLocalPdfPreviewUrl(previewUrlRef.current);
      }

      previewUrlRef.current = nextUrl;
      setPreviewUrl(nextUrl);
    };

    const loadPreview = () => {
      setHasPreviewError(false);
      setIsPreviewLoading(true);
      setNextPreviewUrl(null);

      return exportVaePdfProjectIdExportPdfPost({
        path: { project_id: verfahrenId },
        parseAs: 'blob',
        throwOnError: true,
      })
        .then(({ data }) => {
          if (isCancelled) {
            return;
          }

          setNextPreviewUrl(createLocalPdfPreviewUrl(assertExportBlob(data)));
        })
        .catch(() => {
          if (isCancelled) {
            return;
          }

          setHasPreviewError(true);
        })
        .then(() => {
          if (!isCancelled) {
            setIsPreviewLoading(false);
          }
        });
    };

    void loadPreview();

    return () => {
      isCancelled = true;

      if (previewUrlRef.current) {
        revokeLocalPdfPreviewUrl(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [verfahrenId]);

  /**
   * Downloads the selected export format and keeps the modal download state in sync.
   *
   * @param format Export format requested by the user.
   * @returns Nothing. The function starts a browser download as a side effect.
   */
  const handleDownload = (format: 'pdf' | 'docx') => {
    setDownloadErrorFormat(null);
    setActiveDownloadFormat(format);
    playDownloadConfettiOnce();

    const downloadRequest =
      format === 'pdf'
        ? exportVaePdfProjectIdExportPdfPost({
            path: { project_id: verfahrenId },
            parseAs: 'blob',
            throwOnError: true,
          }).then(({ data, response }) => {
            downloadFinalizedProcedureBlob(
              assertExportBlob(data),
              response.headers.get('Content-Disposition'),
              'pdf',
            );
          })
        : exportVaeDocxProjectIdExportDocxPost({
            path: { project_id: verfahrenId },
            parseAs: 'blob',
            throwOnError: true,
          }).then(({ data, response }) => {
            downloadFinalizedProcedureBlob(
              assertExportBlob(data),
              response.headers.get('Content-Disposition'),
              'docx',
            );
          });

    return downloadRequest
      .catch(() => {
        if (!isDialogOpenRef.current) {
          return;
        }

        setDownloadErrorFormat(format);
      })
      .then(() => {
        if (isDialogOpenRef.current) {
          setActiveDownloadFormat(null);
        }
      });
  };

  const handleOpenChange = (open: boolean) => {
    isDialogOpenRef.current = open;
    onOpenChange(open);
  };

  return (
    <Dialog open={true} onOpenChange={handleOpenChange}>
      {isDownloadConfettiPlaying ? (
        <Suspense fallback={null}>
          <FinalExportConfetti />
        </Suspense>
      ) : null}

      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className="h-[80vh] sm:max-w-6xl"
        innerClassName="flex-1"
      >
        <DialogHeader>
          <DialogTitle>{t('finalize.title')}</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
          <FinalizeProcedureDialogInfoRail
            downloadErrorFormat={downloadErrorFormat}
          />
          <FinalizeProcedureDialogPreviewPane
            hasPreviewError={hasPreviewError}
            isPreviewLoading={isPreviewLoading}
            previewUrl={previewUrl}
          />
        </div>

        <DialogFooter className="p-4">
          <FinalizeProcedureDialogFooter
            activeDownloadFormat={activeDownloadFormat}
            onCancel={() => handleOpenChange(false)}
            onDownload={(format) => {
              void handleDownload(format);
            }}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
