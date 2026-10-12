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
    nodeType: 'fundstelle',
    sourceNodeId: null,
    satzId: 'satz-1',
    dokumentId: 'doc-1',
    gesetzId: 'gesetz-1',
    normId: 'norm-1',
    title: id,
    text: 'Textauszug',
    pageNumbers: [1],
    chunkIds: ['chunk-1'],
    id,
    projectId: 'project-1',
    isDeleted: false,
    frontendParentIds: [],
    updateType: 'automated',
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
    compositeKey: `fundstelle:${id}` as CompositeKey,
    ...overrides,
    confidence: overrides.confidence ?? null,
    consensusRatio: overrides.consensusRatio ?? null,
    relevance: overrides.relevance ?? null,
  };
};

describe('mvpFundstellenCardModels', () => {
  it('keeps only the first entry with the same resolved chunks and title', () => {
    const fundstellen = [
      createFundstelle({
        id: 'fundstelle-1',
        chunkIds: ['chunk-1'],
        pageNumbers: [1],
        title: 'Fundstelle 1',
      }),
      createFundstelle({
        id: 'fundstelle-2',
        chunkIds: ['chunk-2'],
        pageNumbers: [2],
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

  it('reports the highest confidence of a deduplicated group', () => {
    const fundstellen = [
      createFundstelle({
        id: 'fundstelle-1',
        chunkIds: ['chunk-1'],
        pageNumbers: [4],
        title: 'Fundstelle 1',
        confidence: 0.9,
      }),
      createFundstelle({
        id: 'fundstelle-2',
        chunkIds: ['chunk-2'],
        pageNumbers: [1],
        title: 'Fundstelle 1',
        confidence: 0.2,
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
      {
        id: 'fundstelle-2',
        pageNumber: 1,
        title: 'Fundstelle 1',
        confidence: 0.9,
      },
    ]);
  });

  it('ignores a duplicate without a confidence value instead of lowering the group', () => {
    const fundstellen = [
      createFundstelle({
        id: 'fundstelle-1',
        chunkIds: ['chunk-1'],
        pageNumbers: [1],
        title: 'Fundstelle 1',
        confidence: 0.9,
      }),
      createFundstelle({
        id: 'fundstelle-2',
        chunkIds: ['chunk-2'],
        pageNumbers: [4],
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
      {
        id: 'fundstelle-1',
        pageNumber: 1,
        title: 'Fundstelle 1',
        confidence: 0.9,
      },
    ]);
  });

  it('carries no confidence value for a fundstelle without one', () => {
    const entries = createFundstellenCardEntries([
      createFundstelle({ id: 'fundstelle-1', title: 'Fundstelle 1' }),
    ]);

    expect(entries).toEqual([
      { id: 'fundstelle-1', pageNumber: 1, title: 'Fundstelle 1' },
    ]);
  });

  it('keeps entries with the same resolved chunks and different titles', () => {
    const fundstellen = [
      createFundstelle({
        id: 'fundstelle-1',
        chunkIds: ['chunk-1'],
        pageNumbers: [1],
        title: 'Fundstelle 1',
      }),
      createFundstelle({
        id: 'fundstelle-2',
        chunkIds: ['chunk-1'],
        pageNumbers: [2],
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
        pageNumbers: [1],
      }),
      createFundstelle({
        id: 'fundstelle-2',
        title: 'Deckblatt',
        pageNumbers: [2],
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
            normId: 'norm-b',
            pageNumbers: [5],
          }),
        ],
      ],
      [
        'norm-a',
        [
          createFundstelle({
            id: 'fundstelle-a',
            normId: 'norm-a',
            pageNumbers: [5],
          }),
        ],
      ],
      [
        'norm-c',
        [
          createFundstelle({
            id: 'fundstelle-c',
            normId: 'norm-c',
            pageNumbers: [7],
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
            dokumentId: 'doc-1',
            pageNumbers: [3],
          }),
          createFundstelle({
            id: 'fundstelle-2',
            dokumentId: 'doc-1',
            pageNumbers: [3],
          }),
        ],
      ],
      [
        'doc-2',
        [
          createFundstelle({
            id: 'fundstelle-3',
            dokumentId: 'doc-2',
            pageNumbers: [3],
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
