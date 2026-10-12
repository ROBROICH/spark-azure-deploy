import type { NodePayloadByType } from '@/db/nodes/types';

export const findConnectedProjectDocumentId = (
  topicDocuments: NodePayloadByType<'dokument'>[],
  previewDocumentId: string | undefined,
  resolvedPreviewDocument?: Pick<
    NodePayloadByType<'dokument'>,
    'id' | 'dmsFileId'
  > | null,
) => {
  const topicDocument = topicDocuments.find(
    (document) => document.id === previewDocumentId,
  );
  if (topicDocument) {
    return topicDocument.dmsFileId;
  }

  const previewDocument = resolvedPreviewDocument;
  if (previewDocument && previewDocument.id === previewDocumentId) {
    return previewDocument.dmsFileId;
  }

  return undefined;
};

export const findTopicDocumentIdByProjectDocumentId = (
  topicDocuments: NodePayloadByType<'dokument'>[],
  projectDocumentId: string,
) =>
  topicDocuments.find(
    (topicDocument) => topicDocument.dmsFileId === projectDocumentId,
  )?.id;

export const collectTopicProjectDocumentIds = (
  topicDocuments: NodePayloadByType<'dokument'>[],
) => new Set(topicDocuments.map((topicDocument) => topicDocument.dmsFileId));
