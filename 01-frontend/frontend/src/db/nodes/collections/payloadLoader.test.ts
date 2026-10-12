import type { V1ProjectLogicServiceBatchGetNodesResponse } from '@/api-clients/backend';
import { describe, expect, it, vi } from 'vitest';
import { createNodeDataLoader } from './payloadLoader';

const mocks = vi.hoisted(() => ({
  dmsBatchGet: vi.fn(),
  examBatchGet: vi.fn(),
  feedbackBatchGet: vi.fn(),
  omsBatchGet: vi.fn(),
  plsBatchGet: vi.fn(),
  vaeBatchGet: vi.fn(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1DocumentManagementServiceBatchGetNodes: (...args: unknown[]) =>
    mocks.dmsBatchGet(...args),
  v1ExaminationServiceBatchGetNodes: (...args: unknown[]) =>
    mocks.examBatchGet(...args),
  v1FeedbackBatchGetNodes: (...args: unknown[]) =>
    mocks.feedbackBatchGet(...args),
  v1ObjectionsManagementServiceBatchGetNodes: (...args: unknown[]) =>
    mocks.omsBatchGet(...args),
  v1ProjectLogicServiceBatchGetNodes: (...args: unknown[]) =>
    mocks.plsBatchGet(...args),
  v1AdministrativeFileDraftBatchGetNodes: (...args: unknown[]) =>
    mocks.vaeBatchGet(...args),
}));

describe('payloadLoader', () => {
  it('routes feedback and OMS node refs to their batch endpoints and preserves ref order', async () => {
    mocks.plsBatchGet.mockResolvedValue({
      data: {
        results: [{ id: 'topic-1', nodeType: 'topic', name: 'Topic 1' }],
      },
    });
    mocks.feedbackBatchGet.mockResolvedValue({
      data: {
        results: [
          {
            id: 'feedback-1',
            nodeType: 'feedback',
            rating: 'POSITIVE',
            reason: 'useful',
            text: 'Helpful result',
            userId: '00000000-0000-4000-8000-000000000001',
            frontendParentIds: ['topic-1'],
          },
        ],
      },
    });
    mocks.omsBatchGet.mockResolvedValue({
      data: {
        results: [
          {
            id: 'entry-1',
            nodeType: 'beteiligungs_eingang',
            beteiligungTyp: 'einwendung',
            fileId: 'file-1',
            markdownId: 'markdown-1',
            extractionStatus: 'success',
            frontendParentIds: [],
          },
          {
            id: 'markdown-1',
            nodeType: 'beteiligungs_eingang_markdown',
            beteiligungsEingangId: 'entry-1',
            text: 'Markdown',
            frontendParentIds: ['entry-1'],
          },
        ],
      },
    });

    const loader = createNodeDataLoader('verfahren-feedback-test', 1);
    const payloads = await loader.loadMany([
      { id: 'feedback-1', nodeType: 'feedback' },
      { id: 'entry-1', nodeType: 'beteiligungs_eingang' },
      { id: 'markdown-1', nodeType: 'beteiligungs_eingang_markdown' },
      { id: 'topic-1', nodeType: 'topic' },
    ]);

    expect(mocks.feedbackBatchGet).toHaveBeenCalledWith({
      body: {
        nodes: [{ id: 'feedback-1', nodeType: 'feedback' }],
      },
      path: { projectId: 'verfahren-feedback-test' },
      query: { projectVersion: 1 },
      throwOnError: true,
    });
    expect(mocks.omsBatchGet).toHaveBeenCalledWith({
      body: {
        nodes: [
          { id: 'entry-1', nodeType: 'beteiligungs_eingang' },
          { id: 'markdown-1', nodeType: 'beteiligungs_eingang_markdown' },
        ],
      },
      path: { projectId: 'verfahren-feedback-test' },
      query: { projectVersion: 1 },
      throwOnError: true,
    });
    expect(mocks.plsBatchGet).toHaveBeenCalledWith({
      body: {
        nodes: [{ id: 'topic-1', nodeType: 'topic' }],
      },
      path: { projectId: 'verfahren-feedback-test' },
      query: { projectVersion: 1 },
      throwOnError: true,
    });
    expect(mocks.dmsBatchGet).not.toHaveBeenCalled();
    expect(mocks.examBatchGet).not.toHaveBeenCalled();
    expect(mocks.vaeBatchGet).not.toHaveBeenCalled();
    expect(payloads).toEqual([
      expect.objectContaining({
        compositeKey: 'feedback:feedback-1',
        id: 'feedback-1',
        nodeType: 'feedback',
      }),
      expect.objectContaining({
        compositeKey: 'beteiligungs_eingang:entry-1',
        id: 'entry-1',
        nodeType: 'beteiligungs_eingang',
      }),
      expect.objectContaining({
        compositeKey: 'beteiligungs_eingang_markdown:markdown-1',
        id: 'markdown-1',
        nodeType: 'beteiligungs_eingang_markdown',
      }),
      expect.objectContaining({
        compositeKey: 'topic:topic-1',
        id: 'topic-1',
        nodeType: 'topic',
      }),
    ]);
  });

  it('preserves topic_norm revision status fields from the backend payload', async () => {
    mocks.plsBatchGet.mockResolvedValue({
      data: {
        results: [
          {
            id: 'topic-norm-1',
            nodeType: 'topic_norm',
            topicId: 'topic-1',
            projectId: 'project-1',
            mvpStatus: 'needs_revision',
            satzStatuses: {},
          },
        ],
      },
    });

    const loader = createNodeDataLoader('verfahren-topic-norm-test', 1);
    const payloads = await loader.loadMany([
      { id: 'topic-norm-1', nodeType: 'topic_norm' },
    ]);

    expect(payloads).toEqual([
      expect.objectContaining({
        compositeKey: 'topic_norm:topic-norm-1',
        id: 'topic-norm-1',
        mvpStatus: 'needs_revision',
        nodeType: 'topic_norm',
        satzStatuses: {},
      }),
    ]);
  });

  it('reports a missing node when the batch omits its payload', async () => {
    mocks.plsBatchGet.mockResolvedValue({
      data: {
        results: [],
      } satisfies V1ProjectLogicServiceBatchGetNodesResponse,
    });

    const loader = createNodeDataLoader('verfahren-missing-node-test', 1);
    const [result] = await loader.loadMany([
      { id: 'topic-missing', nodeType: 'topic' },
    ]);

    expect(result).toBeInstanceOf(Error);
    expect(result).toHaveProperty(
      'message',
      'Missing node payload for topic:topic-missing',
    );
  });
});
