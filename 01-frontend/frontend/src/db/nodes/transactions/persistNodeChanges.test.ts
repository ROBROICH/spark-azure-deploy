import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InsertNodeAction, NodeRef, UpdateNodeAction } from '../types';
import { persistNodeChanges } from './persistNodeChanges';

const mocks = vi.hoisted(() => ({
  updateExamNodes: vi.fn(),
  updateFeedbackNodes: vi.fn(),
  updateOmsNodes: vi.fn(),
  updatePlsNodes: vi.fn(),
  updateVaeNodes: vi.fn(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1ExaminationServiceUpdateNodes: mocks.updateExamNodes,
  v1FeedbackUpdateNodes: mocks.updateFeedbackNodes,
  v1ObjectionsManagementServiceUpdateNodes: mocks.updateOmsNodes,
  v1ProjectLogicServiceUpdateNodes: mocks.updatePlsNodes,
  v1AdministrativeFileDraftUpdateNodes: mocks.updateVaeNodes,
}));

const serviceMocks = [
  mocks.updateExamNodes,
  mocks.updateFeedbackNodes,
  mocks.updateOmsNodes,
  mocks.updatePlsNodes,
  mocks.updateVaeNodes,
];

describe('persistNodeChanges', () => {
  beforeEach(() => {
    for (const serviceMock of serviceMocks) {
      serviceMock.mockReset();
      serviceMock.mockResolvedValue({ data: {} });
    }
  });

  it('fails closed for DMS node mutations that do not have persistence routing', async () => {
    await expect(
      persistNodeChanges({
        projectId: 'project-1',
        projectVersion: 4,
        inserts: [],
        updates: [
          {
            nodeType: 'file',
            id: 'file-1',
            payload: { filename: 'changed.pdf' },
          } as unknown as UpdateNodeAction,
        ],
        deletes: [],
      }),
    ).rejects.toThrow('Unsupported node mutation type(s): file');

    for (const serviceMock of serviceMocks) {
      expect(serviceMock).not.toHaveBeenCalled();
    }
  });

  it('returns empty persisted changes without calling a backend when there are no changes', async () => {
    await expect(
      persistNodeChanges({
        projectId: 'project-1',
        projectVersion: 4,
        inserts: [],
        updates: [],
        deletes: [],
      }),
    ).resolves.toEqual({ inserted: [], updated: [], deleted: [] });

    for (const serviceMock of serviceMocks) {
      expect(serviceMock).not.toHaveBeenCalled();
    }
  });

  it('routes supported node mutations with the active project version', async () => {
    await persistNodeChanges({
      projectId: 'project-1',
      projectVersion: 4,
      inserts: [],
      updates: [
        {
          nodeType: 'topic',
          id: 'topic-1',
          payload: { name: 'Changed topic' },
        } as UpdateNodeAction,
      ],
      deletes: [],
    });

    expect(mocks.updatePlsNodes).toHaveBeenCalledWith({
      path: { projectId: 'project-1' },
      query: { projectVersion: 4 },
      body: {
        inserts: [],
        updates: [
          {
            nodeType: 'topic',
            id: 'topic-1',
            payload: { name: 'Changed topic' },
          },
        ],
        deletes: [],
      },
      throwOnError: true,
    });
  });

  it('routes all supported backend node groups independently', async () => {
    const inserts = [
      {
        nodeType: 'topic',
        id: 'topic-new',
        payload: { name: 'New topic' },
      } as InsertNodeAction,
      {
        nodeType: 'fundstelle',
        id: 'fundstelle-new',
        payload: { text: 'Fundstelle' },
      } as InsertNodeAction,
      {
        nodeType: 'feedback',
        id: 'feedback-new',
        payload: { comment: 'Feedback' },
      } as unknown as InsertNodeAction,
      {
        nodeType: 'argument',
        id: 'argument-new',
        payload: { text: 'Argument' },
      } as InsertNodeAction,
      {
        nodeType: 'risks',
        id: 'risks-new',
        payload: { risks: [] },
      } as unknown as InsertNodeAction,
    ];

    await persistNodeChanges({
      projectId: 'project-1',
      projectVersion: 7,
      inserts,
      updates: [],
      deletes: [],
    });

    expect(mocks.updatePlsNodes).toHaveBeenCalledWith({
      path: { projectId: 'project-1' },
      query: { projectVersion: 7 },
      body: { inserts: [inserts[0]], updates: [], deletes: [] },
      throwOnError: true,
    });
    expect(mocks.updateExamNodes).toHaveBeenCalledWith({
      path: { projectId: 'project-1' },
      query: { projectVersion: 7 },
      body: { inserts: [inserts[1]], updates: [], deletes: [] },
      throwOnError: true,
    });
    expect(mocks.updateFeedbackNodes).toHaveBeenCalledWith({
      path: { projectId: 'project-1' },
      query: { projectVersion: 7 },
      body: { inserts: [inserts[2]], updates: [], deletes: [] },
      throwOnError: true,
    });
    expect(mocks.updateOmsNodes).toHaveBeenCalledWith({
      path: { projectId: 'project-1' },
      query: { projectVersion: 7 },
      body: { inserts: [inserts[3]], updates: [], deletes: [] },
      throwOnError: true,
    });
    expect(mocks.updateVaeNodes).toHaveBeenCalledWith({
      path: { projectId: 'project-1' },
      query: { projectVersion: 7 },
      body: { inserts: [inserts[4]], updates: [], deletes: [] },
      throwOnError: true,
    });
  });

  it('rejects mixed changes when any node type is unsupported before calling backends', async () => {
    await expect(
      persistNodeChanges({
        projectId: 'project-1',
        projectVersion: 4,
        inserts: [],
        updates: [
          {
            nodeType: 'topic',
            id: 'topic-1',
            payload: { name: 'Changed topic' },
          } as UpdateNodeAction,
        ],
        deletes: [{ nodeType: 'file', id: 'file-1' } as NodeRef],
      }),
    ).rejects.toThrow('Unsupported node mutation type(s): file');

    for (const serviceMock of serviceMocks) {
      expect(serviceMock).not.toHaveBeenCalled();
    }
  });

  it('sends project version as query data and node changes as request body data', async () => {
    const update = {
      nodeType: 'topic',
      id: 'topic-1',
      payload: { name: 'Changed topic' },
    } as UpdateNodeAction;
    const insert = {
      nodeType: 'topic',
      id: 'topic-2',
      payload: { name: 'New topic' },
    } as InsertNodeAction;
    const deleted = { nodeType: 'topic', id: 'topic-3' } as NodeRef;

    await persistNodeChanges({
      projectId: 'project-1',
      projectVersion: 12,
      inserts: [insert],
      updates: [update],
      deletes: [deleted],
    });

    expect(mocks.updatePlsNodes).toHaveBeenCalledWith({
      path: { projectId: 'project-1' },
      query: { projectVersion: 12 },
      body: {
        inserts: [insert],
        updates: [update],
        deletes: [deleted],
      },
      throwOnError: true,
    });
  });

  it('merges persisted inserted, updated, and deleted arrays from backend responses', async () => {
    mocks.updatePlsNodes.mockResolvedValue({
      data: {
        inserted: [null, { nodeType: 'topic', id: 'topic-inserted' }],
        updated: [{ nodeType: 'topic', id: 'topic-updated' }, null],
        deleted: [{ nodeType: 'topic', id: 'topic-deleted' }],
      },
    });
    mocks.updateExamNodes.mockResolvedValue({
      data: {
        inserted: [{ nodeType: 'fundstelle', id: 'fundstelle-inserted' }],
        updated: [{ nodeType: 'fundstelle', id: 'fundstelle-updated' }],
        deleted: [{ nodeType: 'fundstelle', id: 'fundstelle-deleted' }],
      },
    });

    await expect(
      persistNodeChanges({
        projectId: 'project-1',
        projectVersion: 4,
        inserts: [],
        updates: [
          {
            nodeType: 'topic',
            id: 'topic-1',
            payload: { name: 'Changed topic' },
          } as UpdateNodeAction,
          {
            nodeType: 'fundstelle',
            id: 'fundstelle-1',
            payload: { text: 'Changed fundstelle' },
          } as UpdateNodeAction,
        ],
        deletes: [],
      }),
    ).resolves.toEqual({
      inserted: [
        { nodeType: 'topic', id: 'topic-inserted' },
        { nodeType: 'fundstelle', id: 'fundstelle-inserted' },
      ],
      updated: [
        { nodeType: 'topic', id: 'topic-updated' },
        { nodeType: 'fundstelle', id: 'fundstelle-updated' },
      ],
      deleted: [
        { nodeType: 'topic', id: 'topic-deleted' },
        { nodeType: 'fundstelle', id: 'fundstelle-deleted' },
      ],
    });
  });
});
