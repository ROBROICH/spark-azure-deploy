import { describe, expect, it } from 'vitest';
import {
  buildProjectNodeIndex,
  countDescendantsByType,
  countNodesByType,
  getChildNodes,
  getDescendantNodeRefsByType,
  getFirstDescendantNodeRefByType,
  getNodesByType,
  getRootNodeIds,
  hasDescendantByType,
} from './examinationGraphModel';
import type { NodeSummary } from './types';

const createSummary = (
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'nodeType'>,
): NodeSummary => ({
  frontendParentIds: [],
  parents: [],
  ...overrides,
});

describe('examinationGraphModel', () => {
  it('builds indexed roots from parent relationships', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({ id: 'topic-2', nodeType: 'topic' }),
      createSummary({
        id: 'topic-norm-1',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
    ]);

    expect(getRootNodeIds(index)).toEqual(['topic-1', 'topic-2']);
  });

  it('returns nodes by type from the type index', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({ id: 'topic-2', nodeType: 'topic' }),
      createSummary({ id: 'norm-1', nodeType: 'topic_norm' }),
    ]);

    expect(getNodesByType(index, 'topic').map((node) => node.id)).toEqual([
      'topic-1',
      'topic-2',
    ]);
  });

  it('returns node counts by type from the precomputed counts', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({ id: 'topic-2', nodeType: 'topic' }),
      createSummary({ id: 'norm-1', nodeType: 'topic_norm' }),
    ]);

    expect(countNodesByType(index).get('topic')).toBe(2);
    expect(countNodesByType(index).get('topic_norm')).toBe(1);
  });

  it('returns typed descendants without including the start node', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'norm-1',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
      createSummary({
        id: 'norm-2',
        nodeType: 'topic_norm',
        parents: [{ id: 'norm-1', nodeType: 'topic_norm' }],
      }),
    ]);

    expect(
      getDescendantNodeRefsByType(index, 'topic-1', 'topic').map(
        (node) => node.id,
      ),
    ).toEqual([]);
    expect(
      getDescendantNodeRefsByType(index, 'topic-1', 'topic_norm').map(
        (node) => node.id,
      ),
    ).toEqual(['norm-1', 'norm-2']);
  });

  it('counts typed descendants from the shared node index', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'norm-1',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
    ]);

    expect(countDescendantsByType(index, 'topic-1', 'topic_norm')).toBe(1);
    expect(getNodesByType(index, 'topic').map((node) => node.id)).toEqual([
      'topic-1',
    ]);
    expect(getRootNodeIds(index)).toEqual(['topic-1']);
  });

  it('checks descendant presence by type with true and false cases', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'norm-1',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
    ]);

    expect(hasDescendantByType(index, 'topic-1', 'topic_norm')).toBe(true);
    expect(hasDescendantByType(index, 'topic-1', 'gesetz')).toBe(false);
  });

  it('returns the first matching descendant ref by type', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'norm-1',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
      createSummary({
        id: 'norm-2',
        nodeType: 'topic_norm',
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
    ]);

    expect(
      getFirstDescendantNodeRefByType(index, 'topic-1', 'topic_norm'),
    ).toMatchObject({
      id: 'norm-1',
      nodeType: 'topic_norm',
    });
  });

  it('does not duplicate child relationships when parent refs are repeated', () => {
    const index = buildProjectNodeIndex([
      createSummary({ id: 'topic-1', nodeType: 'topic' }),
      createSummary({
        id: 'norm-1',
        nodeType: 'topic_norm',
        frontendParentIds: ['topic:topic-1'],
        parents: [{ id: 'topic-1', nodeType: 'topic' }],
      }),
    ]);

    expect(getChildNodes(index, 'topic-1').map((node) => node.id)).toEqual([
      'norm-1',
    ]);
  });
});
