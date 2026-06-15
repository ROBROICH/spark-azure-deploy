import { getRouteApi } from '@tanstack/react-router';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

export const useOpenRpbPreviewDocument = () => {
  const navigate = route.useNavigate();

  return (documentId: string) => {
    if (!documentId) {
      return;
    }

    void navigate({
      search: (prev) => ({
        ...prev,
        previewDocumentId: documentId,
        selectedFundstelleId: undefined,
      }),
      resetScroll: false,
    });
  };
};
