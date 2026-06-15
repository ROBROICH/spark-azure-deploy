import type { NodePayloadByType } from '@/db/nodes/types';

export const findConnectedProjectDocumentId = (
  topicDocuments: NodePayloadByType<'dokument'>[],
  previewDocumentId: string | undefined,
  resolvedPreviewDocument?: Pick<
    NodePayloadByType<'dokument'>,
    'id' | 'dms_file_id'
  > | null,
) => {
  const topicDocument = topicDocuments.find(
    (document) => document.id === previewDocumentId,
  );
  if (topicDocument) {
    return topicDocument.dms_file_id;
  }

  const previewDocument = resolvedPreviewDocument;
  if (previewDocument && previewDocument.id === previewDocumentId) {
    return previewDocument.dms_file_id;
  }

  return undefined;
};

export const findTopicDocumentIdByProjectDocumentId = (
  topicDocuments: NodePayloadByType<'dokument'>[],
  projectDocumentId: string,
) =>
  topicDocuments.find(
    (topicDocument) => topicDocument.dms_file_id === projectDocumentId,
  )?.id;

export const collectTopicProjectDocumentIds = (
  topicDocuments: NodePayloadByType<'dokument'>[],
) => new Set(topicDocuments.map((topicDocument) => topicDocument.dms_file_id));
