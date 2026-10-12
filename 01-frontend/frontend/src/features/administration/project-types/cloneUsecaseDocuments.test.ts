import { describe, expect, it } from 'vitest';

import type { Usecase } from '../data/usecaseApi';
import { cloneUsecaseDocuments } from './cloneUsecaseDocuments';

const source: Usecase = {
  slug: 'fernstrasse',
  updatedAt: '2026-01-01T00:00:00.000Z',
  projekttyp: { id: 'source-type', name: 'Fernstraße' },
  gesetzesgrundlage: {
    topics: [
      {
        name: 'Natur',
        description: 'Naturthema',
        showInMvp: true,
        showInEwm: false,
        showInBeschluss: true,
        pruefungsNorms: [],
        verfahrensNorms: [],
        subtopics: [],
      },
    ],
    stateNormGroups: { LwaldG: [] },
    topicStateGroups: { Natur: ['LwaldG'] },
  },
  dokumente: {
    categories: [
      {
        id: 'cat-1',
        category: 'Teil A',
        document_types: [
          {
            id: 'doc-1',
            name: 'Erläuterungsbericht',
            description: 'Bericht',
            expected_count: 1,
          },
          {
            id: 'doc-2',
            name: 'Lageplan',
            description: 'Plan',
            expected_count: null,
          },
        ],
      },
    ],
  },
  beschluss: {
    nodes: [
      {
        id: 'node-root',
        parent_vae_node_id: null,
        title: 'Entscheidung',
        text: '',
        topic: null,
        order: 0,
        is_hidden: false,
        can_add_child: true,
      },
      {
        id: 'node-child',
        parent_vae_node_id: 'node-root',
        title: 'Feststellung',
        text: '',
        topic: 'Natur',
        order: 1,
        is_hidden: false,
        can_add_child: false,
      },
    ],
  },
};

describe('cloneUsecaseDocuments', () => {
  it('replaces the project type and regenerates document and decision ids', () => {
    let nextId = 0;
    const cloned = cloneUsecaseDocuments(
      source,
      { id: 'new-type', name: 'Fernstraße Kopie' },
      () => `new-${(nextId += 1)}`,
    );

    expect(cloned.projekttyp).toEqual({
      id: 'new-type',
      name: 'Fernstraße Kopie',
    });
    expect(cloned.gesetzesgrundlage).toEqual(source.gesetzesgrundlage);
    expect(cloned.gesetzesgrundlage).not.toBe(source.gesetzesgrundlage);

    const clonedCategory = cloned.dokumente.categories[0];
    expect(clonedCategory?.id).toBe('new-1');
    expect(clonedCategory?.document_types.map((item) => item.id)).toEqual([
      'new-2',
      'new-3',
    ]);
    expect(clonedCategory?.category).toBe('Teil A');
    expect(clonedCategory?.document_types[0]?.name).toBe('Erläuterungsbericht');

    expect(cloned.beschluss.nodes.map((node) => node.id)).toEqual([
      'new-4',
      'new-5',
    ]);
    expect(cloned.beschluss.nodes[0]?.parent_vae_node_id).toBeNull();
    expect(cloned.beschluss.nodes[1]?.parent_vae_node_id).toBe('new-4');

    const sourceIds = new Set([
      'source-type',
      'cat-1',
      'doc-1',
      'doc-2',
      'node-root',
      'node-child',
    ]);
    const clonedIds = [
      cloned.projekttyp.id,
      ...cloned.dokumente.categories.flatMap((category) => [
        category.id,
        ...category.document_types.map((documentType) => documentType.id),
      ]),
      ...cloned.beschluss.nodes.map((node) => node.id),
    ];

    expect(clonedIds.every((id) => !sourceIds.has(id))).toBe(true);
  });

  it('fails closed when a decision parent is absent from the cloned node map', () => {
    const invalidSource: Usecase = {
      ...source,
      beschluss: {
        nodes: [
          {
            id: 'node-root',
            parent_vae_node_id: null,
            title: 'Entscheidung',
            text: '',
            topic: null,
            order: 0,
            is_hidden: false,
            can_add_child: true,
          },
          {
            id: 'node-child',
            parent_vae_node_id: 'missing-parent',
            title: 'Feststellung',
            text: '',
            topic: 'Natur',
            order: 1,
            is_hidden: false,
            can_add_child: false,
          },
        ],
      },
    };

    expect(() =>
      cloneUsecaseDocuments(
        invalidSource,
        { id: 'new-type', name: 'Fernstraße Kopie' },
        () => 'new-id',
      ),
    ).toThrow('Cloned identifier is missing');
  });
});
