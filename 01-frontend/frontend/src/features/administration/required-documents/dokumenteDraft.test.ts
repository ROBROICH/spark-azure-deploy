import { describe, expect, it } from 'vitest';

import dokumenteFixture from '../data/catalog-mock/fixtures/dokumente.json';
import type { DokumenteDocument } from '../data/usecaseApi';
import {
  createDokumenteDraftState,
  dokumenteDraftReducer,
} from './dokumenteDraft';
import { collectDokumenteIssues } from './dokumenteDraftValidation';

const fixtureDocument = dokumenteFixture as DokumenteDocument;

const draftFrom = (document: DokumenteDocument = fixtureDocument) =>
  createDokumenteDraftState(document);

describe('dokumenteDraftReducer', () => {
  it('adds, renames, and removes a category', () => {
    let state = draftFrom();
    const initialCount = state.document.categories.length;

    state = dokumenteDraftReducer(state, {
      type: 'addCategory',
      name: 'Neue Kategorie',
    });
    expect(state.document.categories).toHaveLength(initialCount + 1);
    expect(state.document.categories.at(-1)?.category).toBe('Neue Kategorie');

    const newIndex = state.document.categories.length - 1;
    state = dokumenteDraftReducer(state, {
      type: 'renameCategory',
      categoryIndex: newIndex,
      name: 'Umbenannt',
    });
    expect(state.document.categories[newIndex]?.category).toBe('Umbenannt');

    state = dokumenteDraftReducer(state, {
      type: 'removeCategory',
      categoryIndex: newIndex,
    });
    expect(state.document.categories).toHaveLength(initialCount);
    expect(state.lastRefusal).toBeNull();
  });

  it('adds, edits, and removes a document type and stores empty expected count as null', () => {
    let state = draftFrom({
      categories: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          category: 'Teil A',
          document_types: [],
        },
      ],
    });

    state = dokumenteDraftReducer(state, {
      type: 'addDocumentType',
      categoryIndex: 0,
      name: 'Lageplan',
    });
    expect(state.document.categories[0]?.document_types).toEqual([
      {
        id: expect.any(String),
        name: 'Lageplan',
        description: '',
        expected_count: null,
      },
    ]);

    state = dokumenteDraftReducer(state, {
      type: 'updateDocumentType',
      categoryIndex: 0,
      typeIndex: 0,
      patch: {
        description: 'Plan',
        expected_count: 2,
      },
    });
    expect(state.document.categories[0]?.document_types[0]).toMatchObject({
      description: 'Plan',
      expected_count: 2,
    });

    state = dokumenteDraftReducer(state, {
      type: 'updateDocumentType',
      categoryIndex: 0,
      typeIndex: 0,
      patch: { expected_count: null },
    });
    expect(
      state.document.categories[0]?.document_types[0]?.expected_count,
    ).toBeNull();

    state = dokumenteDraftReducer(state, {
      type: 'removeDocumentType',
      categoryIndex: 0,
      typeIndex: 0,
    });
    expect(state.document.categories[0]?.document_types).toHaveLength(0);
  });

  it('refuses a duplicate document type name within the same category', () => {
    let state = draftFrom({
      categories: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          category: 'Teil A',
          document_types: [
            {
              id: '00000000-0000-0000-0000-000000000002',
              name: 'Lageplan',
              description: '',
              expected_count: 1,
            },
          ],
        },
      ],
    });

    state = dokumenteDraftReducer(state, {
      type: 'addDocumentType',
      categoryIndex: 0,
      name: 'lageplan',
    });

    expect(state.document.categories[0]?.document_types).toHaveLength(1);
    expect(state.lastRefusal).toEqual({
      code: 'duplicateDocumentTypeName',
      name: 'lageplan',
      categoryIndex: 0,
      typeIndex: 0,
    });
  });

  it('collects a duplicate-name issue when an existing type is renamed onto another', () => {
    const document: DokumenteDocument = {
      categories: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          category: 'Teil A',
          document_types: [
            {
              id: '00000000-0000-0000-0000-000000000002',
              name: 'Lageplan',
              description: '',
              expected_count: 1,
            },
            {
              id: '00000000-0000-0000-0000-000000000003',
              name: 'Höhenplan',
              description: '',
              expected_count: 1,
            },
          ],
        },
      ],
    };
    const state = dokumenteDraftReducer(draftFrom(document), {
      type: 'updateDocumentType',
      categoryIndex: 0,
      typeIndex: 1,
      patch: { name: 'Lageplan' },
    });

    expect(state.lastRefusal?.code).toBe('duplicateDocumentTypeName');
    expect(collectDokumenteIssues(state.document)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'duplicateDocumentTypeName',
          categoryIndex: 0,
        }),
      ]),
    );
  });
});
