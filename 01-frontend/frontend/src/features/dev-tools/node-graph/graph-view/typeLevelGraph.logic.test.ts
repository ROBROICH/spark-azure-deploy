import { buildProjectNodeIndex } from '@/db/nodes/examinationGraphModel';
import type { NodeSummary } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import {
  buildTypeLevelGraphLayout,
  GRAPH_ROOT_NODE_ID,
} from './typeLevelGraph.logic';

const createSummary = (
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'node_type'>,
): NodeSummary => ({
  frontend_parent_ids: [],
  parents: [],
  ...overrides,
});

describe('buildTypeLevelGraphLayout', () => {
  it('places project-scoped root types below the synthetic project root', () => {
    const graph = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', node_type: 'topic' }),
      createSummary({
        id: 'entry-1',
        node_type: 'beteiligungs_eingang',
      }),
      createSummary({
        id: 'argument-1',
        node_type: 'argument',
        parents: [{ id: 'entry-1', node_type: 'beteiligungs_eingang' }],
      }),
    ]);

    const layout = buildTypeLevelGraphLayout(graph, {
      height: 600,
      width: 800,
    });

    expect(layout.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: GRAPH_ROOT_NODE_ID,
          target: 'topic',
        }),
        expect.objectContaining({
          source: GRAPH_ROOT_NODE_ID,
          target: 'beteiligungs_eingang',
        }),
        expect.objectContaining({
          source: 'beteiligungs_eingang',
          target: 'argument',
        }),
      ]),
    );
    expect(layout.nodes.find((node) => node.id === 'topic')?.depth).toBe(1);
    expect(
      layout.nodes.find((node) => node.id === 'beteiligungs_eingang')?.depth,
    ).toBe(1);
    expect(layout.nodes.find((node) => node.id === 'argument')?.depth).toBe(2);
  });
});
