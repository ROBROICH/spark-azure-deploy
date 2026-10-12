import { useLiveNode } from '@/db/nodes/hooks/useLiveNodes';
import type { NodePayloadByType } from '@/db/nodes/types';
import { useRegisterPdfPopoutScope } from '@/features/project/pdf-popout/PdfPopoutWorkspaceContext';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useDeferredValue, useEffect, useMemo } from 'react';
import { findConnectedProjectDocumentId } from '../mvpPage.logic';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

type MvpPdfPopoutScopeRegistrationProps = {
  topicDocuments: NodePayloadByType<'dokument'>[];
};

/**
 * Registers MVP's current topic with the shared PDF workspace, translating
 * route-level dokument ids at the feature boundary while the popout itself
 * remains file-id based.
 */
export function MvpPdfPopoutScopeRegistration(
  props: MvpPdfPopoutScopeRegistrationProps,
) {
  const { verfahrenId, topicName } = route.useParams();
  const previewDocumentId = route.useSearch({
    select: (search) => search.previewDocumentId,
  });
  const navigate = route.useNavigate();
  const deferredPreviewDocumentId = useDeferredValue(previewDocumentId);
  const topicRef = { id: topicName, nodeType: 'topic' as const };
  const { data: topic } = useLiveNode(topicRef);
  const { topicDocuments } = props;
  const connectedFileId = findConnectedProjectDocumentId(
    topicDocuments,
    deferredPreviewDocumentId,
  );
  const validPreviewDocumentId = connectedFileId
    ? deferredPreviewDocumentId
    : undefined;
  const previewDocumentRef = validPreviewDocumentId
    ? { id: validPreviewDocumentId, nodeType: 'dokument' as const }
    : null;
  const { data: previewDocument } = useLiveNode(previewDocumentRef);
  const connectedFilePreview =
    connectedFileId && previewDocument
      ? {
          title:
            previewDocument.filename.split('/').pop() ??
            previewDocument.filename,
          isPdf: previewDocument.filename.toLowerCase().endsWith('.pdf'),
        }
      : undefined;

  // eslint-disable-next-line no-restricted-syntax -- route-backed preview ids must be canonicalized after topic-document membership is known.
  useEffect(() => {
    if (!deferredPreviewDocumentId || connectedFileId) {
      return;
    }

    void navigate({
      search: (prev) => ({
        ...prev,
        previewDocumentId: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  }, [connectedFileId, deferredPreviewDocumentId, navigate]);

  // eslint-disable-next-line no-restricted-syntax -- stable callback identity prevents unnecessary popout-scope re-registration while MVP rerenders
  const selectDokument = useCallback(
    (nextDokumentId: string) => {
      navigate({
        search: (prev) => ({
          ...prev,
          previewDocumentId: nextDokumentId,
        }),
        replace: true,
        resetScroll: false,
      });
    },
    [navigate],
  );

  // eslint-disable-next-line no-restricted-syntax -- stable callback identity prevents unnecessary popout-scope re-registration while MVP rerenders
  const handleConnectedDocumentSelect = useCallback(
    (projectDocumentId: string) => {
      const nextDokumentId = topicDocuments.find(
        (projectDokument: NodePayloadByType<'dokument'>) =>
          projectDokument.dmsFileId === projectDocumentId,
      )?.id;

      const resolvedDocumentId = nextDokumentId;

      if (!resolvedDocumentId || resolvedDocumentId === previewDocumentId) {
        return;
      }

      selectDokument(resolvedDocumentId);
    },
    [previewDocumentId, selectDokument, topicDocuments],
  );

  // eslint-disable-next-line no-restricted-syntax -- stable Set identity avoids re-registering the popout scope on every render
  const scopeFileIds = useMemo(
    () =>
      new Set(topicDocuments.map((topicDokument) => topicDokument.dmsFileId)),
    [topicDocuments],
  );

  useRegisterPdfPopoutScope({
    scopeKey: `mvp:${verfahrenId}:${topicName}`,
    projectId: verfahrenId,
    connectedFileId,
    connectedFilePreview,
    onConnectedFileSelect: handleConnectedDocumentSelect,
    topicLabel: topic?.name ?? topicName,
    scopeFileIds,
    preferredDocumentFilter: 'topic',
  });

  return <></>;
}
