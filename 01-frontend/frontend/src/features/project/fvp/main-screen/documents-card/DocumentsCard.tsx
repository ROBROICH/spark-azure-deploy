import { Alert, AlertDescription, AlertTitle } from '@/features/ui/alert/Alert';
import { useProjectProcessingState } from '@/features/project/data/file-processing/useProjectProcessingState';
import { getRouteApi } from '@tanstack/react-router';
import { AlertTriangle, CircleX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DocumentsTable } from './documents-table/DocumentsTable';
import { DocumentsTableSkeleton } from './documents-table/DocumentsTableSkeleton';
import { DocumentsToolbar } from './documents-table/DocumentsToolbar';
import { PdfPreview } from './pdf-preview/PdfPreview';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/documents/');

type DocumentsCardProps = {
  isFcsLoading: boolean;
};

/**
 * Renders the FVP documents card: toolbar, table, and an optional side-by-side
 * PDF preview, plus file-processing and processing-error alerts. Shows a
 * skeleton while FCS data loads and disables interaction while files process.
 */
export const DocumentsCard = (props: DocumentsCardProps) => {
  const { isFcsLoading } = props;
  const { t } = useTranslation('FormalCompletenessCheck');
  const { verfahrenId } = route.useParams();
  const previewDocumentId = route.useSearch({
    select: (search) => search.previewDocumentId,
  });
  const { hasActiveFileProcessing, hasFailedFileProcessing } =
    useProjectProcessingState({ projectId: verfahrenId });

  if (isFcsLoading) {
    return (
      <div className="flex flex-col gap-4">
        <DocumentsToolbar disabled />
        <DocumentsTableSkeleton />
      </div>
    );
  }

  const isDocumentsBusy = hasActiveFileProcessing;
  const showPreview = !!previewDocumentId && !isDocumentsBusy;

  return (
    <div className="flex flex-col gap-4">
      <div role="status" aria-live="polite" className="sr-only">
        {showPreview
          ? t('redesign.documentsCard.previewOpenedAnnouncement')
          : ''}
      </div>
      <DocumentsToolbar disabled={isDocumentsBusy} />
      {hasActiveFileProcessing && (
        <Alert variant="warning">
          <AlertTriangle className="text-warning-600" />
          <AlertTitle>{t('DocumentsCard.processing.title')}</AlertTitle>
          <AlertDescription>
            {t('DocumentsCard.processing.description')}
          </AlertDescription>
        </Alert>
      )}
      {hasFailedFileProcessing && (
        <Alert className="border-red-200 bg-red-50 text-red-800">
          <CircleX className="text-red-700" />
          <AlertTitle>{t('DocumentsCard.processingError.title')}</AlertTitle>
          <AlertDescription>
            {t('DocumentsCard.processingError.description')}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col items-start gap-6 sm:flex-row">
        <div
          className={
            showPreview
              ? 'w-full min-w-0 overflow-x-clip sm:flex-1'
              : 'w-full min-w-0 overflow-x-clip'
          }
        >
          <DocumentsTable forceLoading={isDocumentsBusy} />
        </div>
        {showPreview && (
          <div className="top-8 h-auto w-full shrink-0 self-start sm:sticky sm:h-[min(64rem,calc(100dvh-8rem))] sm:w-1/2">
            <PdfPreview />
          </div>
        )}
      </div>
    </div>
  );
};
