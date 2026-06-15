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
    node_type: 'vae_node',
    id: overrides.id,
    title: overrides.title,
    text: overrides.text ?? '',
    assignee: overrides.assignee ?? null,
    checked_by_assignee: overrides.checked_by_assignee ?? false,
    checked_by_leader: overrides.checked_by_leader ?? false,
    checked_at_assignee: overrides.checked_at_assignee ?? null,
    checked_at_leader: overrides.checked_at_leader ?? null,
    parent_vae_node_id: overrides.parent_vae_node_id ?? null,
    order: overrides.order ?? 0,
    template_id: overrides.template_id ?? null,
    is_hidden: overrides.is_hidden ?? false,
    can_add_child: overrides.can_add_child ?? false,
    topic_id: overrides.topic_id ?? null,
    subtopic_id: overrides.subtopic_id ?? null,
    project_id: overrides.project_id ?? 'project-1',
    is_deleted: overrides.is_deleted ?? false,
    frontend_parent_ids: overrides.frontend_parent_ids ?? [],
    update_type: overrides.update_type ?? null,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00Z',
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00Z',
    sys_period: overrides.sys_period ?? null,
    compositeKey: overrides.compositeKey
      ? overrides.compositeKey
      : toCompositeKey({
          id: overrides.id,
          node_type: 'vae_node',
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
        parent_vae_node_id: 'root-a',
      }),
      createVaeNode({ id: 'root-b', title: 'Root B', order: 2 }),
      createVaeNode({
        id: 'grandchild',
        title: 'Grandchild',
        order: 1,
        parent_vae_node_id: 'child-b',
      }),
      createVaeNode({ id: 'root-a', title: 'Root A', order: 1 }),
      createVaeNode({
        id: 'child-a',
        title: 'Child A',
        order: 1,
        parent_vae_node_id: 'root-a',
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
        is_hidden: true,
      }),
      createVaeNode({
        id: 'deleted-child',
        title: 'Deleted Child',
        order: 1,
        parent_vae_node_id: 'visible-root',
        is_deleted: true,
      }),
      createVaeNode({
        id: 'orphan',
        title: 'Orphan',
        order: 3,
        parent_vae_node_id: 'missing-parent',
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
        parent_vae_node_id: 'self-parent',
      }),
      createVaeNode({ id: 'root-b', title: 'Root B', order: 1 }),
      createVaeNode({ id: 'root-a', title: 'Root A', order: 1 }),
      createVaeNode({
        id: 'child-b',
        title: 'Child B',
        order: 1,
        parent_vae_node_id: 'root-a',
      }),
      createVaeNode({
        id: 'child-a',
        title: 'Child A',
        order: 1,
        parent_vae_node_id: 'root-a',
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
      parent_vae_node_id: 'root',
    }),
    createVaeNode({
      id: 'grandchild',
      title: 'Grandchild',
      order: 1,
      parent_vae_node_id: 'child',
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
        parent_vae_node_id: 'root',
        checked_by_assignee: true,
      }),
      createVaeNode({
        id: 'child-b',
        title: 'Child B',
        order: 2,
        parent_vae_node_id: 'root',
        checked_by_assignee: true,
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
        checked_by_assignee: true,
      }),
      createVaeNode({
        id: 'leader-only',
        title: 'Leader only',
        order: 2,
        checked_by_leader: true,
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
        checked_by_assignee: true,
      }),
      createVaeNode({
        id: 'root-b',
        title: 'Root B',
        order: 2,
        checked_by_assignee: false,
      }),
      createVaeNode({
        id: 'child-a',
        title: 'Child A',
        order: 1,
        parent_vae_node_id: 'root-b',
        checked_by_assignee: true,
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
        topic_id: 'topic-1',
      }),
      createVaeNode({
        id: 'topic-grandchild',
        title: 'Topic Grandchild',
        parent_vae_node_id: 'topic-root',
      }),
      createVaeNode({
        id: 'project-root',
        title: 'Project Root',
      }),
      createVaeNode({
        id: 'project-grandchild',
        title: 'Project Grandchild',
        parent_vae_node_id: 'project-root',
      }),
      createVaeNode({
        id: 'broken-child',
        title: 'Broken Child',
        parent_vae_node_id: 'missing-parent',
      }),
      createVaeNode({
        id: 'cycle-a',
        title: 'Cycle A',
        parent_vae_node_id: 'cycle-b',
      }),
      createVaeNode({
        id: 'cycle-b',
        title: 'Cycle B',
        parent_vae_node_id: 'cycle-a',
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
