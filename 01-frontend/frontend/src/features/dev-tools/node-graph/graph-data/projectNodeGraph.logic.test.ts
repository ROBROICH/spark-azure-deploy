import {
  buildProjectNodeIndex,
  hasNode,
} from '@/db/nodes/examinationGraphModel';
import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodeSummary } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import {
  buildScopedProjectNodeIndex,
  getNodeDegree,
  getNodeEdges,
} from './projectNodeGraph.logic';

const buildSummaries = (): NodeSummary[] => [
  {
    id: 'topic-1',
    nodeType: 'topic',
    parents: [],
  },
  {
    id: 'topic-norm-1',
    nodeType: 'topic_norm',
    parents: [{ id: 'topic-1', nodeType: 'topic' }],
  },
  {
    id: 'norm-1',
    nodeType: 'norm',
    parents: [{ id: 'topic-norm-1', nodeType: 'topic_norm' }],
  },
  {
    id: 'satz-1',
    nodeType: 'satz',
    parents: [{ id: 'topic-norm-1', nodeType: 'topic_norm' }],
  },
  {
    id: 'dokument-1',
    nodeType: 'dokument',
    parents: [],
    frontendParentIds: [toCompositeKey({ id: 'topic-1', nodeType: 'topic' })],
  },
];

describe('projectNodeGraph logic', () => {
  it('enumerates parent-to-child edges without duplicating repeated parent refs', () => {
    const index = buildProjectNodeIndex([
      {
        id: 'topic-1',
        nodeType: 'topic',
        parents: [],
      },
      {
        id: 'topic-norm-1',
        nodeType: 'topic_norm',
        frontendParentIds: [
          toCompositeKey({ id: 'topic-1', nodeType: 'topic' }),
        ],
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      },
    ]);

    expect(getNodeEdges(index)).toEqual([
      { source: 'topic-1', target: 'topic-norm-1' },
    ]);
  });

  it('calculates node degree from incoming and outgoing indexed edges', () => {
    const index = buildProjectNodeIndex(buildSummaries());

    expect(getNodeDegree(index, 'topic-1')).toBe(2);
    expect(getNodeDegree(index, 'topic-norm-1')).toBe(3);
    expect(getNodeDegree(index, 'satz-1')).toBe(1);
    expect(getNodeDegree(index, 'missing-node')).toBe(0);
  });

  it('rebuilds scoped indexes from selected summaries and preserves scoped edges', () => {
    const index = buildProjectNodeIndex(buildSummaries());
    const scopedIndex = buildScopedProjectNodeIndex(index, [
      'topic-1',
      'topic-norm-1',
      'missing-node',
      'topic-norm-1',
    ]);

    expect(hasNode(scopedIndex, 'topic-1')).toBe(true);
    expect(hasNode(scopedIndex, 'topic-norm-1')).toBe(true);
    expect(hasNode(scopedIndex, 'norm-1')).toBe(false);
    expect(getNodeEdges(scopedIndex)).toEqual([
      { source: 'topic-1', target: 'topic-norm-1' },
    ]);
  });
});
