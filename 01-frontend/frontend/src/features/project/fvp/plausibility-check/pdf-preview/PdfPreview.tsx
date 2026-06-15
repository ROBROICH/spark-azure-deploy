import { PdfQuickView } from '@/features/project/pdf-quick-view/PdfQuickView';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useProjectFilePreview } from '@/features/project/data/project-files/useProjectFilePreview';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/pp/');

export const PdfPreview = () => {
  const navigate = useNavigate();
  const { t } = useTranslation('PlausibilityCheck');
  const { verfahrenId } = route.useParams();
  const { previewDocumentId, previewPageNumber } = route.useSearch();
  const { title, downloadUrl, isLoading } = useProjectFilePreview({
    projectId: verfahrenId,
    fileId: previewDocumentId,
    fallbackTitle: t('common.document'),
  });

  const handleClose = () => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        previewDocumentId: undefined,
        previewPageNumber: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <PdfQuickView
      key={`${previewDocumentId ?? 'no-document'}-${previewPageNumber ?? 'no-page'}`}
      title={title}
      pdfUrl={downloadUrl}
      onClose={handleClose}
      pageNumber={previewPageNumber}
      isLoading={isLoading}
    />
  );
};
