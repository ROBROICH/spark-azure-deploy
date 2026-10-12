import { describe, expect, it } from 'vitest';

import beschlussFixture from '../data/catalog-mock/fixtures/beschluss.json';
import type { BeschlussDocument, BeschlussNode } from '../data/usecaseApi';
import {
  beschlussDraftReducer,
  collectBeschlussIssues,
  createBeschlussDraftState,
} from './beschlussDraft';
import {
  buildBeschlussTree,
  collectSubtreeIds,
  reorderSibling,
} from './beschlussTree';

const fixtureDocument = beschlussFixture as BeschlussDocument;

const node = (
  id: string,
  parent: string | null,
  order: number,
  patch: Partial<BeschlussNode> = {},
): BeschlussNode => ({
  id,
  parent_vae_node_id: parent,
  title: id,
  text: '',
  topic: null,
  order,
  is_hidden: false,
  can_add_child: true,
  ...patch,
});

describe('buildBeschlussTree', () => {
  it('builds the fixture tree with 159 nodes and ordered children', () => {
    const roots = buildBeschlussTree(fixtureDocument.nodes);
    const countNodes = (
      treeNodes: ReturnType<typeof buildBeschlussTree>,
    ): number =>
      treeNodes.reduce(
        (sum, treeNode) => sum + 1 + countNodes(treeNode.children),
        0,
      );

    expect(fixtureDocument.nodes).toHaveLength(159);
    expect(countNodes(roots)).toBe(159);
    expect(roots.map((treeNode) => treeNode.node.title)).toEqual([
      'Entscheidung',
      'Begründung',
      'Rechtsbehelfsbelehrung',
    ]);

    const entscheidung = roots[0];
    expect(entscheidung?.children[0]?.node.title).toBe(
      'Feststellung des Plans',
    );
  });

  it('treats cyclic parents as roots instead of nesting forever', () => {
    const cyclic: BeschlussNode[] = [node('a', 'b', 0), node('b', 'a', 1)];
    const roots = buildBeschlussTree(cyclic);
    expect(roots).toHaveLength(2);
    expect(roots.every((treeNode) => treeNode.children.length === 0)).toBe(
      true,
    );
  });
});

describe('subtree removal and sibling reorder', () => {
  it('collects a node and its descendants', () => {
    const nodes = [
      node('root', null, 0),
      node('child', 'root', 1),
      node('grandchild', 'child', 2),
      node('other', 'root', 3),
    ];

    expect([...collectSubtreeIds(nodes, 'child')].sort()).toEqual([
      'child',
      'grandchild',
    ]);
  });

  it('removes a subtree without changing the globally unique remaining order', () => {
    const document: BeschlussDocument = {
      nodes: [
        node('root', null, 0),
        node('a', 'root', 1),
        node('a-child', 'a', 2),
        node('b', 'root', 3),
        node('c', 'root', 4),
      ],
    };
    const state = beschlussDraftReducer(createBeschlussDraftState(document), {
      type: 'removeNode',
      nodeId: 'a',
    });

    expect(state.document.nodes.map((item) => item.id)).toEqual([
      'root',
      'b',
      'c',
    ]);
    expect(
      state.document.nodes
        .filter((item) => item.parent_vae_node_id === 'root')
        .map((item) => item.order),
    ).toEqual([3, 4]);
    expect(new Set(state.document.nodes.map((item) => item.order)).size).toBe(
      state.document.nodes.length,
    );
  });

  it('swaps adjacent sibling orders without changing unrelated node orders', () => {
    const nodes = [
      node('root', null, 0),
      node('a', 'root', 1),
      node('a-child', 'a', 2),
      node('b', 'root', 3),
      node('c', 'root', 4),
      node('other-root', null, 5),
    ];
    const reordered = reorderSibling(nodes, 'c', 'up');
    const siblings = reordered
      .filter((item) => item.parent_vae_node_id === 'root')
      .sort((left, right) => left.order - right.order);

    expect(siblings.map((item) => item.id)).toEqual(['a', 'c', 'b']);
    expect(siblings.map((item) => item.order)).toEqual([1, 3, 4]);
    expect(
      Object.fromEntries(reordered.map((item) => [item.id, item.order])),
    ).toEqual({
      root: 0,
      a: 1,
      'a-child': 2,
      b: 4,
      c: 3,
      'other-root': 5,
    });
    expect(new Set(reordered.map((item) => item.order)).size).toBe(
      reordered.length,
    );
  });

  it('moves Begründung before Entscheidung without duplicating descendant orders', () => {
    const nodes = [
      node('entscheidung', null, 0),
      node('feststellung', 'entscheidung', 1),
      node('planunterlagen', 'entscheidung', 2),
      node('begruendung', null, 14),
      node('rechtsbehelfsbelehrung', null, 156),
    ];

    const reordered = reorderSibling(nodes, 'begruendung', 'up');
    const roots = reordered
      .filter((item) => item.parent_vae_node_id === null)
      .sort((left, right) => left.order - right.order);

    expect(roots.map((item) => item.id)).toEqual([
      'begruendung',
      'entscheidung',
      'rechtsbehelfsbelehrung',
    ]);
    expect(
      Object.fromEntries(reordered.map((item) => [item.id, item.order])),
    ).toEqual({
      entscheidung: 14,
      feststellung: 1,
      planunterlagen: 2,
      begruendung: 0,
      rechtsbehelfsbelehrung: 156,
    });
    expect(new Set(reordered.map((item) => item.order)).size).toBe(
      reordered.length,
    );
  });
});

describe('beschlussDraftReducer create-below', () => {
  it('creates a child with the next globally unique order', () => {
    const document: BeschlussDocument = {
      nodes: [
        node('root', null, 0, { can_add_child: true }),
        node('existing-child', 'root', 1),
        node('other-root', null, 8),
        node('other-child', 'other-root', 9),
      ],
    };
    const state = beschlussDraftReducer(createBeschlussDraftState(document), {
      type: 'addChild',
      parentId: 'root',
      title: 'Kind',
    });

    expect(state.document.nodes).toHaveLength(5);
    expect(state.document.nodes[4]).toMatchObject({
      parent_vae_node_id: 'root',
      title: 'Kind',
      order: 10,
      topic: null,
    });
    expect(new Set(state.document.nodes.map((item) => item.order)).size).toBe(
      state.document.nodes.length,
    );
  });

  it('does not create a child when can_add_child is false', () => {
    const document: BeschlussDocument = {
      nodes: [node('root', null, 0, { can_add_child: false })],
    };
    const state = beschlussDraftReducer(createBeschlussDraftState(document), {
      type: 'addChild',
      parentId: 'root',
      title: 'Kind',
    });

    expect(state.document.nodes).toHaveLength(1);
    expect(state.lastRefusal).toEqual({
      code: 'cannotAddChild',
      nodeId: 'root',
    });
  });
});

describe('collectBeschlussIssues', () => {
  it('blocks unknown topic references', () => {
    const issues = collectBeschlussIssues(
      [node('n1', null, 0, { title: 'A', topic: 'Ghost' })],
      new Set(['Nebenbestimmungen']),
    );

    expect(issues).toEqual([
      {
        code: 'unknownTopic',
        nodeId: 'n1',
        title: 'A',
        topic: 'Ghost',
      },
    ]);
  });
});
