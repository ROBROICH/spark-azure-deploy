import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import {
  collectTopicProjectDocumentIds,
  findConnectedProjectDocumentId,
  findTopicDocumentIdByProjectDocumentId,
} from './rpbPage.logic';

const topicDocuments = [
  {
    id: 'topic-doc-1',
    nodeType: 'dokument',
    documentId: null,
    dmsFileId: 'project-file-1',
    filename: 'Ordner/Dokument 1.pdf',
    mimeType: 'application/pdf',
    pageCount: 1,
    documentType: null,
    summary: '',
    markdownTextId: 'markdown-1',
    isTocDocument: false,
    projectId: 'project-1',
    isDeleted: false,
    frontendParentIds: [],
    updateType: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    compositeKey: toCompositeKey({ id: 'topic-doc-1', nodeType: 'dokument' }),
  },
  {
    id: 'topic-doc-2',
    nodeType: 'dokument',
    documentId: null,
    dmsFileId: 'project-file-2',
    filename: 'Ordner/Dokument 2.pdf',
    mimeType: 'application/pdf',
    pageCount: 1,
    documentType: null,
    summary: '',
    markdownTextId: 'markdown-2',
    isTocDocument: false,
    projectId: 'project-1',
    isDeleted: false,
    frontendParentIds: [],
    updateType: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    compositeKey: toCompositeKey({ id: 'topic-doc-2', nodeType: 'dokument' }),
  },
] satisfies NodePayloadByType<'dokument'>[];

describe('rpbPage.logic', () => {
  it('maps the selected topic dokument id to the connected project file id', () => {
    expect(findConnectedProjectDocumentId(topicDocuments, 'topic-doc-2')).toBe(
      'project-file-2',
    );
  });

  it('maps a project file selection back to the matching topic dokument id', () => {
    expect(
      findTopicDocumentIdByProjectDocumentId(topicDocuments, 'project-file-1'),
    ).toBe('topic-doc-1');
  });

  it('collects the project file ids for the active topic filter', () => {
    expect([...collectTopicProjectDocumentIds(topicDocuments)]).toEqual([
      'project-file-1',
      'project-file-2',
    ]);
  });
});
