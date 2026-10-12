import type { NodePayloadByType, NodeRefByType } from '@/db/nodes/types';
import { useRegisterPdfPopoutScope } from '@/features/project/pdf-popout/PdfPopoutWorkspaceContext';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useNode, useNodes } from '@/db/nodes/hooks/useNodes';
import { useTopicNodes } from '@/db/nodes/hooks/useTopicNodes';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';
import {
  collectTopicProjectDocumentIds,
  findConnectedProjectDocumentId,
  findTopicDocumentIdByProjectDocumentId,
} from '../rpbPage.logic';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

const getDocumentLabel = (filename: string) =>
  filename.split('/').pop() ?? filename;

const getConnectedFilePreview = (
  previewDocument: NodePayloadByType<'dokument'> | null | undefined,
) =>
  previewDocument
    ? {
        title: getDocumentLabel(previewDocument.filename),
        isPdf: previewDocument.filename.toLowerCase().endsWith('.pdf'),
      }
    : undefined;

/**
 * Keeps PDF popout registration scoped to the selected topic while resolving
 * route preview document IDs through topic/project document mappings.
 */
export const RpbPdfPopoutScopeRegistration = () => {
  const navigate = route.useNavigate();
  const { verfahrenId } = route.useParams();
  const { previewDocumentId, topicId } = route.useSearch({
    select: (search) => ({
      previewDocumentId: search.previewDocumentId,
      topicId: search.topicId,
    }),
  });
  const { getDescendants } = useGraph();
  const { data: topics } = useTopicNodes();
  const selectedTopic = topicId
    ? (topics.find((topic) => topic.id === topicId) ?? null)
    : null;
  const topicDocumentRefs = topicId
    ? getDescendants(topicId).filter(
        (ref): ref is NodeRefByType<'dokument'> => ref.nodeType === 'dokument',
      )
    : [];
  const { data: topicDocuments } = useNodes(topicDocumentRefs);
  const previewDocumentRef = previewDocumentId
    ? { id: previewDocumentId, nodeType: 'dokument' as const }
    : null;
  const { data: previewDocument } = useNode(previewDocumentRef);
  const connectedFileId = findConnectedProjectDocumentId(
    topicDocuments,
    previewDocumentId,
    previewDocument,
  );
  const connectedFilePreview = getConnectedFilePreview(previewDocument);

  // eslint-disable-next-line no-restricted-syntax -- stable callback identity avoids unnecessary popout-scope re-registration on ordinary rerenders
  const handleConnectedDocumentSelect = useCallback(
    (projectDocumentId: string) => {
      const nextDocumentId =
        findTopicDocumentIdByProjectDocumentId(
          topicDocuments,
          projectDocumentId,
        ) ??
        (previewDocument?.dmsFileId === projectDocumentId
          ? previewDocument.id
          : undefined);

      if (!nextDocumentId || nextDocumentId === previewDocumentId) {
        return;
      }

      void navigate({
        search: (prev) => ({
          ...prev,
          previewDocumentId: nextDocumentId,
          selectedFundstelleId: undefined,
        }),
        resetScroll: false,
      });
    },
    [navigate, previewDocument, previewDocumentId, topicDocuments],
  );

  // eslint-disable-next-line no-restricted-syntax -- stable Set identity avoids re-registering the popout scope on every render
  const scopeFileIds = useMemo(() => {
    if (!selectedTopic) {
      return new Set<string>();
    }

    return collectTopicProjectDocumentIds(topicDocuments);
  }, [selectedTopic, topicDocuments]);

  useRegisterPdfPopoutScope({
    scopeKey: `rpb:${verfahrenId}:${topicId ?? 'all'}`,
    projectId: verfahrenId,
    connectedFileId,
    connectedFilePreview,
    onConnectedFileSelect: handleConnectedDocumentSelect,
    topicLabel: selectedTopic?.name ?? undefined,
    scopeFileIds: topicId ? scopeFileIds : undefined,
    preferredDocumentFilter: topicId ? 'topic' : 'all',
  });

  return null;
};
