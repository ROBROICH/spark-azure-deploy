import { useProjectFilePreview } from '@/features/project/data/project-files/useProjectFilePreview';
import { PdfQuickView } from '@/features/project/pdf-quick-view/PdfQuickView';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/documents/');

export const PdfPreview = () => {
  const { t } = useTranslation('FormalCompletenessCheck');
  const navigate = route.useNavigate();
  const { verfahrenId } = route.useParams();
  const previewDocumentId = route.useSearch({
    select: (search) => search.previewDocumentId,
  });

  const { title, downloadUrl, isLoading } = useProjectFilePreview({
    projectId: verfahrenId,
    fileId: previewDocumentId,
    fallbackTitle: t('redesign.documentsCard.previewFallbackTitle'),
  });

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

  return (
    <PdfQuickView
      title={title}
      pdfUrl={downloadUrl}
      onClose={handleClose}
      isLoading={isLoading}
    />
  );
};
