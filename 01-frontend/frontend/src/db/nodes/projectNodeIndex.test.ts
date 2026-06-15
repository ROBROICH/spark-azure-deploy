import { describe, expect, it } from 'vitest';
import { toCompositeKey } from './compositeKey';
import {
  buildProjectNodeIndex,
  countDescendantsByType,
  getChildNodes,
  getDescendantNodeRefs,
  getDescendantNodeRefsByType,
  getFirstDescendantNodeRefByType,
  getRootNodeIds,
  hasDescendantByType,
} from './projectNodeIndex';
import type { NodeSummary } from './types';

const buildSummaries = (): NodeSummary[] => [
  {
    id: 'topic-1',
    node_type: 'topic',
    parents: [],
  },
  {
    id: 'topic-norm-1',
    node_type: 'topic_norm',
    parents: [{ id: 'topic-1', node_type: 'topic' }],
  },
  {
    id: 'norm-1',
    node_type: 'norm',
    parents: [{ id: 'topic-norm-1', node_type: 'topic_norm' }],
  },
  {
    id: 'satz-1',
    node_type: 'satz',
    parents: [{ id: 'topic-norm-1', node_type: 'topic_norm' }],
  },
  {
    id: 'dokument-1',
    node_type: 'dokument',
    parents: [],
    frontend_parent_ids: [
      toCompositeKey({ id: 'topic-1', node_type: 'topic' }),
    ],
  },
];

describe('ProjectNodeIndex', () => {
  it('builds roots and descendant refs from persisted and frontend edges', () => {
    const index = buildProjectNodeIndex(buildSummaries());

    expect(getRootNodeIds(index)).toEqual(['topic-1']);
    expect(
      getDescendantNodeRefs(index, 'topic-1').map((ref) => ref.id),
    ).toEqual(['topic-1', 'topic-norm-1', 'dokument-1', 'norm-1', 'satz-1']);
  });

  it('returns typed descendants without including the start node', () => {
    const index = buildProjectNodeIndex(buildSummaries());

    expect(
      getDescendantNodeRefsByType(index, 'topic-1', 'topic_norm').map(
        (ref) => ref.id,
      ),
    ).toEqual(['topic-norm-1']);
    expect(
      getDescendantNodeRefsByType(index, 'topic-norm-1', 'satz').map(
        (ref) => ref.id,
      ),
    ).toEqual(['satz-1']);
  });

  it('supports typed descendant counts and first-match lookups', () => {
    const index = buildProjectNodeIndex(buildSummaries());

    expect(countDescendantsByType(index, 'topic-1', 'dokument')).toBe(1);
    expect(hasDescendantByType(index, 'topic-1', 'norm')).toBe(true);
    expect(hasDescendantByType(index, 'topic-1', 'bewertung')).toBe(false);
    expect(getFirstDescendantNodeRefByType(index, 'topic-1', 'norm')).toEqual({
      id: 'norm-1',
      node_type: 'norm',
      parents: [{ id: 'topic-norm-1', node_type: 'topic_norm' }],
    });
  });

  it('returns direct child nodes filtered by type', () => {
    const index = buildProjectNodeIndex([
      ...buildSummaries(),
      {
        id: 'bewertung-1',
        node_type: 'bewertung',
        parents: [{ id: 'satz-1', node_type: 'satz' }],
      },
    ]);

    expect(
      getChildNodes(index, { id: 'topic-norm-1', node_type: 'topic_norm' }).map(
        (ref) => ref.id,
      ),
    ).toEqual(['norm-1', 'satz-1']);
    expect(getChildNodes(index, 'topic-norm-1', 'satz')).toEqual([
      {
        id: 'satz-1',
        node_type: 'satz',
        parents: [{ id: 'topic-norm-1', node_type: 'topic_norm' }],
      },
    ]);
  });
});
