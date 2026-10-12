import {
  buildProjectNodeIndex,
  hasNode,
} from '@/db/nodes/examinationGraphModel';
import type { NodePayloadByType, NodeSummary } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import { getNodeEdges } from '../graph-data/projectNodeGraph.logic';
import {
  buildDescendantScopedGraph,
  buildTopicScopedGraph,
} from './graphDataTopic.logic';

const createSummary = (
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'nodeType'>,
): NodeSummary => ({
  frontendParentIds: [],
  parents: [],
  ...overrides,
});

describe('graphDataTopic logic', () => {
  it('keeps the selected topic and its outgoing edge in topic-scoped graphs', () => {
    const topic = createSummary({ id: 'topic-1', nodeType: 'topic' });
    const child = createSummary({
      id: 'norm-1',
      nodeType: 'topic_norm',
      parents: [{ id: topic.id, nodeType: topic.nodeType }],
    });
    const scopedGraph = buildTopicScopedGraph({
      graph: buildProjectNodeIndex([topic, child]),
      selectedTopic: topic as unknown as NodePayloadByType<'topic'>,
      getDescendants: () => [{ id: child.id }],
    });

    expect(hasNode(scopedGraph, topic.id)).toBe(true);
    expect(hasNode(scopedGraph, child.id)).toBe(true);
    expect(getNodeEdges(scopedGraph)).toContainEqual({
      source: topic.id,
      target: child.id,
    });
  });

  it('keeps the selected root and its outgoing edge in descendant-scoped graphs', () => {
    const root = createSummary({ id: 'satz-1', nodeType: 'satz' });
    const child = createSummary({
      id: 'argument-1',
      nodeType: 'argument',
      parents: [{ id: root.id, nodeType: root.nodeType }],
    });
    const scopedGraph = buildDescendantScopedGraph({
      graph: buildProjectNodeIndex([root, child]),
      selectedNodeId: root.id,
      getDescendants: () => [{ id: child.id }],
    });

    expect(hasNode(scopedGraph, root.id)).toBe(true);
    expect(hasNode(scopedGraph, child.id)).toBe(true);
    expect(getNodeEdges(scopedGraph)).toContainEqual({
      source: root.id,
      target: child.id,
    });
  });
});
