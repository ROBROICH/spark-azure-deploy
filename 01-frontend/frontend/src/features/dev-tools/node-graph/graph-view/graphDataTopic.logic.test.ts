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
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'node_type'>,
): NodeSummary => ({
  frontend_parent_ids: [],
  parents: [],
  ...overrides,
});

describe('graphDataTopic logic', () => {
  it('keeps the selected topic and its outgoing edge in topic-scoped graphs', () => {
    const topic = createSummary({ id: 'topic-1', node_type: 'topic' });
    const child = createSummary({
      id: 'norm-1',
      node_type: 'topic_norm',
      parents: [{ id: topic.id, node_type: topic.node_type }],
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
    const root = createSummary({ id: 'satz-1', node_type: 'satz' });
    const child = createSummary({
      id: 'argument-1',
      node_type: 'argument',
      parents: [{ id: root.id, node_type: root.node_type }],
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
