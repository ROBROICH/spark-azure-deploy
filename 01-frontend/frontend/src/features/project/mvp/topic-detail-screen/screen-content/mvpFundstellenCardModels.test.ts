import type { CompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import {
  createFundstellenCardEntries,
  createFundstellenDedupeKeyById,
  createFundstellenDocumentGroupCardModels,
  createFundstellenNormGroupCardModels,
} from './mvpFundstellenCardModels';

const createFundstelle = (
  overrides: Partial<NodePayloadByType<'fundstelle'>>,
): NodePayloadByType<'fundstelle'> => {
  const id = overrides.id ?? 'fundstelle-1';

  return {
    node_type: 'fundstelle',
    satz_id: 'satz-1',
    dokument_id: 'doc-1',
    gesetz_id: 'gesetz-1',
    norm_id: 'norm-1',
    title: id,
    text: 'Textauszug',
    page_numbers: [1],
    chunk_ids: ['chunk-1'],
    id,
    project_id: 'project-1',
    is_deleted: false,
    frontend_parent_ids: [],
    update_type: 'automated',
    created_at: '2026-04-02T00:00:00.000Z',
    updated_at: '2026-04-02T00:00:00.000Z',
    sys_period: null,
    compositeKey: `fundstelle:${id}` as CompositeKey,
    ...overrides,
  };
};

describe('mvpFundstellenCardModels', () => {
  it('keeps only the first entry with the same resolved chunks and title', () => {
    const fundstellen = [
      createFundstelle({
        id: 'fundstelle-1',
        chunk_ids: ['chunk-1'],
        page_numbers: [1],
        title: 'Fundstelle 1',
      }),
      createFundstelle({
        id: 'fundstelle-2',
        chunk_ids: ['chunk-2'],
        page_numbers: [2],
        title: 'Fundstelle 1',
      }),
    ];
    const dedupeKeyByFundstelleId = createFundstellenDedupeKeyById(
      fundstellen,
      new Map([
        ['fundstelle-1', ['chunk-1']],
        ['fundstelle-2', ['chunk-1']],
      ]),
    );
    const entries = createFundstellenCardEntries(
      fundstellen,
      dedupeKeyByFundstelleId,
    );

    expect(entries).toEqual([
      { id: 'fundstelle-1', pageNumber: 1, title: 'Fundstelle 1' },
    ]);
  });

  it('keeps entries with the same resolved chunks and different titles', () => {
    const fundstellen = [
      createFundstelle({
        id: 'fundstelle-1',
        chunk_ids: ['chunk-1'],
        page_numbers: [1],
        title: 'Fundstelle 1',
      }),
      createFundstelle({
        id: 'fundstelle-2',
        chunk_ids: ['chunk-1'],
        page_numbers: [2],
        title: 'Fundstelle 2',
      }),
    ];
    const dedupeKeyByFundstelleId = createFundstellenDedupeKeyById(
      fundstellen,
      new Map([
        ['fundstelle-1', ['chunk-1']],
        ['fundstelle-2', ['chunk-1']],
      ]),
    );
    const entries = createFundstellenCardEntries(
      fundstellen,
      dedupeKeyByFundstelleId,
    );

    expect(entries).toEqual([
      { id: 'fundstelle-1', pageNumber: 1, title: 'Fundstelle 1' },
      { id: 'fundstelle-2', pageNumber: 2, title: 'Fundstelle 2' },
    ]);
  });

  it('keeps entries with the same title on different pages', () => {
    const entries = createFundstellenCardEntries([
      createFundstelle({
        id: 'fundstelle-1',
        title: 'Deckblatt',
        page_numbers: [1],
      }),
      createFundstelle({
        id: 'fundstelle-2',
        title: 'Deckblatt',
        page_numbers: [2],
      }),
    ]);

    expect(entries).toEqual([
      { id: 'fundstelle-1', pageNumber: 1, title: 'Deckblatt' },
      { id: 'fundstelle-2', pageNumber: 2, title: 'Deckblatt' },
    ]);
  });

  it('keeps different node ids on the same document page across norm cards', () => {
    const fundstellenByNormId = new Map<
      string,
      NodePayloadByType<'fundstelle'>[]
    >([
      [
        'norm-b',
        [
          createFundstelle({
            id: 'fundstelle-b',
            norm_id: 'norm-b',
            page_numbers: [5],
          }),
        ],
      ],
      [
        'norm-a',
        [
          createFundstelle({
            id: 'fundstelle-a',
            norm_id: 'norm-a',
            page_numbers: [5],
          }),
        ],
      ],
      [
        'norm-c',
        [
          createFundstelle({
            id: 'fundstelle-c',
            norm_id: 'norm-c',
            page_numbers: [7],
          }),
        ],
      ],
    ]);

    const cards = createFundstellenNormGroupCardModels(fundstellenByNormId);

    expect(cards).toEqual([
      {
        normId: 'norm-a',
        entries: [{ id: 'fundstelle-a', pageNumber: 5, title: 'fundstelle-a' }],
      },
      {
        normId: 'norm-b',
        entries: [{ id: 'fundstelle-b', pageNumber: 5, title: 'fundstelle-b' }],
      },
      {
        normId: 'norm-c',
        entries: [{ id: 'fundstelle-c', pageNumber: 7, title: 'fundstelle-c' }],
      },
    ]);
  });

  it('keeps different node ids on the same document page', () => {
    const fundstellenByDocumentId = new Map<
      string,
      NodePayloadByType<'fundstelle'>[]
    >([
      [
        'doc-1',
        [
          createFundstelle({
            id: 'fundstelle-1',
            dokument_id: 'doc-1',
            page_numbers: [3],
          }),
          createFundstelle({
            id: 'fundstelle-2',
            dokument_id: 'doc-1',
            page_numbers: [3],
          }),
        ],
      ],
      [
        'doc-2',
        [
          createFundstelle({
            id: 'fundstelle-3',
            dokument_id: 'doc-2',
            page_numbers: [3],
          }),
        ],
      ],
    ]);

    const cards = createFundstellenDocumentGroupCardModels(
      fundstellenByDocumentId,
    );

    expect(cards).toEqual([
      {
        documentId: 'doc-1',
        entries: [
          { id: 'fundstelle-1', pageNumber: 3, title: 'fundstelle-1' },
          { id: 'fundstelle-2', pageNumber: 3, title: 'fundstelle-2' },
        ],
      },
      {
        documentId: 'doc-2',
        entries: [{ id: 'fundstelle-3', pageNumber: 3, title: 'fundstelle-3' }],
      },
    ]);
  });
});
