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

vi.mock('@/api-clients/dms-module', () => ({
  batchGetProjectIdBatchNodesPost: (...args: unknown[]) =>
    mocks.dmsBatchGet(...args),
}));

vi.mock('@/api-clients/examination-module', () => ({
  batchGetProjectIdBatchNodesPost: (...args: unknown[]) =>
    mocks.examBatchGet(...args),
}));

vi.mock('@/api-clients/feedback-module', () => ({
  batchGetProjectIdBatchNodesPost: (...args: unknown[]) =>
    mocks.feedbackBatchGet(...args),
}));

vi.mock('@/api-clients/oms-module', () => ({
  batchGetProjectIdBatchNodesPost: (...args: unknown[]) =>
    mocks.omsBatchGet(...args),
}));

vi.mock('@/api-clients/pls-module', () => ({
  batchGetProjectIdBatchNodesPost: (...args: unknown[]) =>
    mocks.plsBatchGet(...args),
}));

vi.mock('@/api-clients/vae-module', () => ({
  batchGetProjectIdBatchNodesPost: (...args: unknown[]) =>
    mocks.vaeBatchGet(...args),
}));

describe('payloadLoader', () => {
  it('routes feedback and OMS node refs to their batch endpoints and preserves ref order', async () => {
    mocks.plsBatchGet.mockResolvedValue({
      data: {
        results: [{ id: 'topic-1', node_type: 'topic', name: 'Topic 1' }],
      },
    });
    mocks.feedbackBatchGet.mockResolvedValue({
      data: {
        results: [
          {
            id: 'feedback-1',
            node_type: 'feedback',
            rating: 'POSITIVE',
            reason: 'useful',
            text: 'Helpful result',
            user_id: '00000000-0000-4000-8000-000000000001',
            frontend_parent_ids: ['topic-1'],
          },
        ],
      },
    });
    mocks.omsBatchGet.mockResolvedValue({
      data: {
        results: [
          {
            id: 'entry-1',
            node_type: 'beteiligungs_eingang',
            beteiligung_typ: 'einwendung',
            file_id: 'file-1',
            beteiligungs_eingang_markdown_id: 'markdown-1',
            extraction_status: 'success',
            frontend_parent_ids: [],
          },
          {
            id: 'markdown-1',
            node_type: 'beteiligungs_eingang_markdown',
            beteiligungs_eingang_id: 'entry-1',
            text: 'Markdown',
            frontend_parent_ids: ['entry-1'],
          },
        ],
      },
    });

    const loader = createNodeDataLoader('verfahren-feedback-test', 1);
    const payloads = await loader.loadMany([
      { id: 'feedback-1', node_type: 'feedback' },
      { id: 'entry-1', node_type: 'beteiligungs_eingang' },
      { id: 'markdown-1', node_type: 'beteiligungs_eingang_markdown' },
      { id: 'topic-1', node_type: 'topic' },
    ]);

    expect(mocks.feedbackBatchGet).toHaveBeenCalledWith({
      body: {
        nodes: [{ id: 'feedback-1', node_type: 'feedback' }],
      },
      path: { project_id: 'verfahren-feedback-test' },
      query: { project_version: 1 },
      throwOnError: true,
    });
    expect(mocks.omsBatchGet).toHaveBeenCalledWith({
      body: {
        nodes: [
          { id: 'entry-1', node_type: 'beteiligungs_eingang' },
          { id: 'markdown-1', node_type: 'beteiligungs_eingang_markdown' },
        ],
      },
      path: { project_id: 'verfahren-feedback-test' },
      query: { project_version: 1 },
      throwOnError: true,
    });
    expect(mocks.plsBatchGet).toHaveBeenCalledWith({
      body: {
        nodes: [{ id: 'topic-1', node_type: 'topic' }],
      },
      path: { project_id: 'verfahren-feedback-test' },
      query: { project_version: 1 },
      throwOnError: true,
    });
    expect(mocks.dmsBatchGet).not.toHaveBeenCalled();
    expect(mocks.examBatchGet).not.toHaveBeenCalled();
    expect(mocks.vaeBatchGet).not.toHaveBeenCalled();
    expect(payloads).toEqual([
      expect.objectContaining({
        compositeKey: 'feedback:feedback-1',
        id: 'feedback-1',
        node_type: 'feedback',
      }),
      expect.objectContaining({
        compositeKey: 'beteiligungs_eingang:entry-1',
        id: 'entry-1',
        node_type: 'beteiligungs_eingang',
      }),
      expect.objectContaining({
        compositeKey: 'beteiligungs_eingang_markdown:markdown-1',
        id: 'markdown-1',
        node_type: 'beteiligungs_eingang_markdown',
      }),
      expect.objectContaining({
        compositeKey: 'topic:topic-1',
        id: 'topic-1',
        node_type: 'topic',
      }),
    ]);
  });

  it('preserves topic_norm revision status fields from the backend payload', async () => {
    mocks.plsBatchGet.mockResolvedValue({
      data: {
        results: [
          {
            id: 'topic-norm-1',
            node_type: 'topic_norm',
            topic_id: 'topic-1',
            project_id: 'project-1',
            mvp_status: 'needs_revision',
            satz_statuses: {},
          },
        ],
      },
    });

    const loader = createNodeDataLoader('verfahren-topic-norm-test', 1);
    const payloads = await loader.loadMany([
      { id: 'topic-norm-1', node_type: 'topic_norm' },
    ]);

    expect(payloads).toEqual([
      expect.objectContaining({
        compositeKey: 'topic_norm:topic-norm-1',
        id: 'topic-norm-1',
        mvp_status: 'needs_revision',
        node_type: 'topic_norm',
        satz_statuses: {},
      }),
    ]);
  });
});
