import { useProjectFilePreview } from '@/features/project/data/project-files/useProjectFilePreview';
import { PdfQuickView } from '@/features/project/pdf-quick-view/PdfQuickView';
import { getRouteApi } from '@tanstack/react-router';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelectedDocumentVersion } from './useSelectedDocumentVersion';

const route = getRouteApi('/verfahren/$verfahrenId/');

export const ReadOnlyPdfPreview = () => {
  const { verfahrenId } = route.useParams();
  const { previewDocumentId } = route.useSearch({
    select: (search) => ({
      previewDocumentId: search.previewDocumentId,
    }),
  });
  const navigate = route.useNavigate();
  const { t } = useTranslation('Project');
  const { selectedDocumentVersion } = useSelectedDocumentVersion();

  const handleClose = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        previewDocumentId: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const { title, downloadUrl, isLoading, isError } = useProjectFilePreview({
    documentVersion: selectedDocumentVersion,
    projectId: verfahrenId,
    fileId: previewDocumentId,
    fallbackTitle: t('Documents.previewFallbackTitle'),
  });

  if (isError) {
    return (
      <div className="flex h-full w-full flex-col rounded-lg border border-border-primary bg-neutral-white">
        <div className="flex shrink-0 items-center justify-between border-b border-border-primary px-4 py-3">
          <h3 className="text-label-m text-text-primary">{title}</h3>
          <button
            type="button"
            onClick={handleClose}
            className="focus-ring cursor-pointer rounded p-1 hover:bg-bg-tertiary"
            aria-label={t('Documents.previewError.title')}
          >
            <X className="size-5 text-text-secondary" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <p className="text-base font-medium text-text-primary">
            {t('Documents.previewError.title')}
          </p>
          <p className="text-sm text-text-secondary">
            {t('Documents.previewError.description')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <PdfQuickView
      title={title}
      pdfUrl={downloadUrl}
      onClose={handleClose}
      isLoading={isLoading}
    />
  );
};
