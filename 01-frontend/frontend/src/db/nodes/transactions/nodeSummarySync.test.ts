import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NodeRef, NodeSummary } from '../types';
import {
  syncDeletedSummaries,
  syncInsertedSummaries,
  syncUpdatedSummaries,
} from './nodeSummarySync';

type SummaryCollection = Parameters<typeof syncUpdatedSummaries>[0];
type UpdatedSummaryNode = Parameters<typeof syncUpdatedSummaries>[1][number];
type InsertedSummaryNode = Parameters<typeof syncInsertedSummaries>[1][number];

const createSummaryCollection = (
  summaries: NodeSummary[] = [],
): SummaryCollection => {
  return {
    state: new Map(
      summaries.map((summary) => [
        `${summary.nodeType}:${summary.id}`,
        { ...summary, compositeKey: `${summary.nodeType}:${summary.id}` },
      ]),
    ),
    utils: {
      writeDelete: vi.fn(),
      writeUpsert: vi.fn(),
    },
  } as unknown as SummaryCollection;
};

describe('nodeSummarySync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates existing summaries with changed frontend parent ids while preserving backend-derived fields', () => {
    const collection = createSummaryCollection([
      {
        id: 'topic-1',
        nodeType: 'topic',
        parents: [{ id: 'project-1', nodeType: 'project' }],
        frontendParentIds: ['old-parent'],
        isOutdated: true,
      },
    ]);

    syncUpdatedSummaries(collection, [
      {
        id: 'topic-1',
        nodeType: 'topic',
        payload: { name: 'Changed topic' },
        frontendParentIds: ['new-parent'],
      } as unknown as UpdatedSummaryNode,
    ]);

    expect(collection.utils.writeUpsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'topic-1',
        nodeType: 'topic',
        parents: [{ id: 'project-1', nodeType: 'project' }],
        frontendParentIds: ['new-parent'],
        isOutdated: true,
        compositeKey: 'topic:topic-1',
      }),
    ]);
  });

  it('inserts summaries for new nodes that include frontend parent ids', () => {
    const collection = createSummaryCollection();

    syncInsertedSummaries(collection, [
      {
        id: 'topic-1',
        nodeType: 'topic',
        payload: { name: 'New topic' },
        frontendParentIds: ['project-1'],
      } as unknown as InsertedSummaryNode,
    ]);

    expect(collection.utils.writeUpsert).toHaveBeenCalledWith([
      {
        id: 'topic-1',
        nodeType: 'topic',
        parents: [],
        frontendParentIds: ['project-1'],
        compositeKey: 'topic:topic-1',
      },
    ]);
  });

  it('deletes summaries by composite key', () => {
    const collection = createSummaryCollection();
    const deletedNodes: NodeRef[] = [
      { id: 'topic-1', nodeType: 'topic' },
      { id: 'feedback-1', nodeType: 'feedback' },
    ];

    syncDeletedSummaries(collection, deletedNodes);

    expect(collection.utils.writeDelete).toHaveBeenCalledWith([
      'topic:topic-1',
      'feedback:feedback-1',
    ]);
  });

  it('ignores inserted and updated nodes without frontend parent ids', () => {
    const collection = createSummaryCollection([
      {
        id: 'topic-1',
        nodeType: 'topic',
        parents: [],
      },
    ]);

    syncUpdatedSummaries(collection, [
      {
        id: 'topic-1',
        nodeType: 'topic',
        payload: { name: 'Changed topic' },
      } as unknown as UpdatedSummaryNode,
    ]);
    syncInsertedSummaries(collection, [
      {
        id: 'topic-2',
        nodeType: 'topic',
        payload: { name: 'New topic' },
      } as unknown as InsertedSummaryNode,
    ]);

    expect(collection.utils.writeUpsert).not.toHaveBeenCalled();
  });

  it('ignores updated nodes that are not present in the summary collection', () => {
    const collection = createSummaryCollection();

    syncUpdatedSummaries(collection, [
      {
        id: 'topic-missing',
        nodeType: 'topic',
        payload: { name: 'Changed topic' },
        frontendParentIds: ['project-1'],
      } as unknown as UpdatedSummaryNode,
    ]);

    expect(collection.utils.writeUpsert).not.toHaveBeenCalled();
  });
});
