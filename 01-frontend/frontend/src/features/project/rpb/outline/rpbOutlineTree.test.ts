import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import {
  areAllTopLevelRpbOutlineNodesChecked,
  buildRpbOutlineTree,
  createRpbOutlineCheckedStateById,
  findRpbOutlineAncestorIds,
  findRpbOutlineNodeById,
  findRpbOutlineNodeLineage,
  flattenRpbOutlineTree,
  flattenRpbOutlineNodeIds,
  resolveRpbOutlineMutationTopicId,
} from './rpbOutlineTree';

// Intentionally duplicated from RpbOutlineContext.test.tsx — these tests may need
// different overrides as the context and utility layers diverge.
const createVaeNode = (
  overrides: Partial<NodePayloadByType<'vae_node'>> & {
    id: string;
    title: string;
  },
): NodePayloadByType<'vae_node'> => {
  return {
    nodeType: 'vae_node',
    id: overrides.id,
    title: overrides.title,
    text: overrides.text ?? '',
    assignee: overrides.assignee ?? null,
    checkedByAssignee: overrides.checkedByAssignee ?? false,
    checkedByLeader: overrides.checkedByLeader ?? false,
    checkedAtAssignee: overrides.checkedAtAssignee ?? null,
    checkedAtLeader: overrides.checkedAtLeader ?? null,
    parentVaeNodeId: overrides.parentVaeNodeId ?? null,
    order: overrides.order ?? 0,
    templateId: overrides.templateId ?? null,
    isHidden: overrides.isHidden ?? false,
    canAddChild: overrides.canAddChild ?? false,
    topicId: overrides.topicId ?? null,
    subtopicId: overrides.subtopicId ?? null,
    projectId: overrides.projectId ?? 'project-1',
    isDeleted: overrides.isDeleted ?? false,
    frontendParentIds: overrides.frontendParentIds ?? [],
    updateType: overrides.updateType ?? null,
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00Z',
    compositeKey: overrides.compositeKey
      ? overrides.compositeKey
      : toCompositeKey({
          id: overrides.id,
          nodeType: 'vae_node',
        }),
  };
};

describe('buildRpbOutlineTree', () => {
  it('builds and sorts the recursive tree from parent_vae_node_id', () => {
    const outlineTree = buildRpbOutlineTree([
      createVaeNode({
        id: 'child-b',
        title: 'Child B',
        order: 2,
        parentVaeNodeId: 'root-a',
      }),
      createVaeNode({ id: 'root-b', title: 'Root B', order: 2 }),
      createVaeNode({
        id: 'grandchild',
        title: 'Grandchild',
        order: 1,
        parentVaeNodeId: 'child-b',
      }),
      createVaeNode({ id: 'root-a', title: 'Root A', order: 1 }),
      createVaeNode({
        id: 'child-a',
        title: 'Child A',
        order: 1,
        parentVaeNodeId: 'root-a',
      }),
    ]);

    expect(outlineTree.map((node) => node.vaeNode.id)).toEqual([
      'root-a',
      'root-b',
    ]);
    expect(outlineTree[0]?.children.map((node) => node.vaeNode.id)).toEqual([
      'child-a',
      'child-b',
    ]);
    expect(
      outlineTree[0]?.children[1]?.children.map((node) => node.vaeNode.id),
    ).toEqual(['grandchild']);
  });

  it('filters hidden and deleted nodes and promotes orphaned children to roots', () => {
    const outlineTree = buildRpbOutlineTree([
      createVaeNode({ id: 'visible-root', title: 'Visible Root', order: 1 }),
      createVaeNode({
        id: 'hidden-root',
        title: 'Hidden Root',
        order: 2,
        isHidden: true,
      }),
      createVaeNode({
        id: 'deleted-child',
        title: 'Deleted Child',
        order: 1,
        parentVaeNodeId: 'visible-root',
        isDeleted: true,
      }),
      createVaeNode({
        id: 'orphan',
        title: 'Orphan',
        order: 3,
        parentVaeNodeId: 'missing-parent',
      }),
    ]);

    expect(outlineTree.map((node) => node.vaeNode.id)).toEqual([
      'visible-root',
      'orphan',
    ]);
    expect(outlineTree[0]?.children).toEqual([]);
  });

  it('promotes self-parented nodes to roots and keeps sibling order deterministic by id when orders match', () => {
    const outlineTree = buildRpbOutlineTree([
      createVaeNode({
        id: 'self-parent',
        title: 'Self Parent',
        order: 2,
        parentVaeNodeId: 'self-parent',
      }),
      createVaeNode({ id: 'root-b', title: 'Root B', order: 1 }),
      createVaeNode({ id: 'root-a', title: 'Root A', order: 1 }),
      createVaeNode({
        id: 'child-b',
        title: 'Child B',
        order: 1,
        parentVaeNodeId: 'root-a',
      }),
      createVaeNode({
        id: 'child-a',
        title: 'Child A',
        order: 1,
        parentVaeNodeId: 'root-a',
      }),
    ]);

    expect(outlineTree.map((node) => node.vaeNode.id)).toEqual([
      'root-a',
      'root-b',
      'self-parent',
    ]);
    expect(outlineTree[0]?.children.map((node) => node.vaeNode.id)).toEqual([
      'child-a',
      'child-b',
    ]);
  });
});

describe('outline tree helpers', () => {
  const outlineTree = buildRpbOutlineTree([
    createVaeNode({ id: 'root', title: 'Root', order: 1 }),
    createVaeNode({
      id: 'child',
      title: 'Child',
      order: 1,
      parentVaeNodeId: 'root',
    }),
    createVaeNode({
      id: 'grandchild',
      title: 'Grandchild',
      order: 1,
      parentVaeNodeId: 'child',
    }),
  ]);

  it('flattens ids only to the configured normalization depth', () => {
    expect(flattenRpbOutlineNodeIds(outlineTree, 1)).toEqual(['root', 'child']);
  });

  it('flattens the outline tree with depth and sibling index metadata', () => {
    expect(flattenRpbOutlineTree(outlineTree)).toEqual([
      { vaeNode: outlineTree[0]?.vaeNode, depth: 0, index: 0 },
      { vaeNode: outlineTree[0]?.children[0]?.vaeNode, depth: 1, index: 0 },
      {
        vaeNode: outlineTree[0]?.children[0]?.children[0]?.vaeNode,
        depth: 2,
        index: 0,
      },
    ]);
  });

  it('finds ancestor ids from root to a deep target', () => {
    expect(findRpbOutlineAncestorIds(outlineTree, 'grandchild')).toEqual([
      'root',
      'child',
    ]);
  });

  it('finds the full node lineage from root to a deep target', () => {
    expect(
      findRpbOutlineNodeLineage(outlineTree, 'grandchild').map(
        (node) => node.vaeNode.id,
      ),
    ).toEqual(['root', 'child', 'grandchild']);
  });

  it('finds one outline node by id', () => {
    expect(findRpbOutlineNodeById(outlineTree, 'child')?.vaeNode.id).toBe(
      'child',
    );
    expect(findRpbOutlineNodeById(outlineTree, 'missing-node')).toBeNull();
  });

  it('reflects only the persisted checked state for each node for the assignee role', () => {
    const checkedTree = buildRpbOutlineTree([
      createVaeNode({ id: 'root', title: 'Root', order: 1 }),
      createVaeNode({
        id: 'child-a',
        title: 'Child A',
        order: 1,
        parentVaeNodeId: 'root',
        checkedByAssignee: true,
      }),
      createVaeNode({
        id: 'child-b',
        title: 'Child B',
        order: 2,
        parentVaeNodeId: 'root',
        checkedByAssignee: true,
      }),
    ]);
    const checkedStateById = createRpbOutlineCheckedStateById(
      checkedTree,
      false,
    );

    expect(checkedStateById.get('root')).toBe(false);
    expect(checkedStateById.get('child-a')).toBe(true);
    expect(checkedStateById.get('child-b')).toBe(true);
    expect(
      areAllTopLevelRpbOutlineNodesChecked(
        checkedTree,
        false,
        checkedStateById,
      ),
    ).toBe(false);
  });

  it('reads checked_by_assignee for the assignee role and checked_by_leader for the leader role', () => {
    const mixedTree = buildRpbOutlineTree([
      createVaeNode({
        id: 'assignee-only',
        title: 'Assignee only',
        order: 1,
        checkedByAssignee: true,
      }),
      createVaeNode({
        id: 'leader-only',
        title: 'Leader only',
        order: 2,
        checkedByLeader: true,
      }),
      createVaeNode({
        id: 'neither',
        title: 'Neither',
        order: 3,
      }),
    ]);

    const assigneeView = createRpbOutlineCheckedStateById(mixedTree, false);
    expect(assigneeView.get('assignee-only')).toBe(true);
    expect(assigneeView.get('leader-only')).toBe(false);
    expect(assigneeView.get('neither')).toBe(false);

    const leaderView = createRpbOutlineCheckedStateById(mixedTree, true);
    expect(leaderView.get('assignee-only')).toBe(false);
    expect(leaderView.get('leader-only')).toBe(true);
    expect(leaderView.get('neither')).toBe(false);
  });

  it('treats all top-level nodes as checked only when each root is checked itself', () => {
    const partiallyCheckedTree = buildRpbOutlineTree([
      createVaeNode({
        id: 'root-a',
        title: 'Root A',
        order: 1,
        checkedByAssignee: true,
      }),
      createVaeNode({
        id: 'root-b',
        title: 'Root B',
        order: 2,
        checkedByAssignee: false,
      }),
      createVaeNode({
        id: 'child-a',
        title: 'Child A',
        order: 1,
        parentVaeNodeId: 'root-b',
        checkedByAssignee: true,
      }),
    ]);
    const checkedStateById = createRpbOutlineCheckedStateById(
      partiallyCheckedTree,
      false,
    );

    expect(checkedStateById.get('root-a')).toBe(true);
    expect(checkedStateById.get('root-b')).toBe(false);
    expect(
      areAllTopLevelRpbOutlineNodesChecked(
        partiallyCheckedTree,
        false,
        checkedStateById,
      ),
    ).toBe(false);
  });

  it('resolves mutation topic ids through the full flat parent chain', () => {
    const nodes = [
      createVaeNode({
        id: 'topic-root',
        title: 'Topic Root',
        topicId: 'topic-1',
      }),
      createVaeNode({
        id: 'topic-grandchild',
        title: 'Topic Grandchild',
        parentVaeNodeId: 'topic-root',
      }),
      createVaeNode({
        id: 'project-root',
        title: 'Project Root',
      }),
      createVaeNode({
        id: 'project-grandchild',
        title: 'Project Grandchild',
        parentVaeNodeId: 'project-root',
      }),
      createVaeNode({
        id: 'broken-child',
        title: 'Broken Child',
        parentVaeNodeId: 'missing-parent',
      }),
      createVaeNode({
        id: 'cycle-a',
        title: 'Cycle A',
        parentVaeNodeId: 'cycle-b',
      }),
      createVaeNode({
        id: 'cycle-b',
        title: 'Cycle B',
        parentVaeNodeId: 'cycle-a',
      }),
    ];

    expect(resolveRpbOutlineMutationTopicId(nodes, 'topic-grandchild')).toBe(
      'topic-1',
    );
    expect(resolveRpbOutlineMutationTopicId(nodes, 'project-grandchild')).toBe(
      null,
    );
    expect(resolveRpbOutlineMutationTopicId(nodes, 'broken-child')).toBe(
      undefined,
    );
    expect(resolveRpbOutlineMutationTopicId(nodes, 'cycle-a')).toBe(undefined);
  });
});
