import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  useFundstellenDocumentNormResult,
  useFundstellenDocumentResult,
  useFundstellenNormResult,
} from './useFundstellenSelectionResult';

const { descendantsByRefKey, fundstellenById } = vi.hoisted(() => ({
  descendantsByRefKey: new Map<
    string,
    { id: string; node_type: 'fundstelle' }[]
  >(),
  fundstellenById: new Map<string, NodePayloadByType<'fundstelle'>>(),
}));

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: (
    _nodeType: 'fundstelle',
    parentRef: { id: string; node_type: string } | null,
  ) => (parentRef ? (descendantsByRefKey.get(parentRef.id) ?? []) : []),
}));

vi.mock('@/db/nodes/hooks/useLiveNodes', () => ({
  useLiveNodes: (refs: { id: string }[]) => ({
    data: refs.flatMap((ref) => {
      const fundstelle = fundstellenById.get(ref.id);

      return fundstelle ? [fundstelle] : [];
    }),
    isLoading: false,
  }),
}));

vi.mock('@/db/nodes/graphPerf', () => ({
  measureGraphPerf: (_name: string, callback: () => unknown) => callback(),
}));

vi.mock('./useFundstellenDedupeKeys', () => ({
  useFundstellenDedupeKeys: () => ({
    dedupeKeyByFundstelleId: new Map(),
  }),
}));

const createFundstelle = (
  id: string,
  dokumentId: string,
  normId: string,
  pageNumber: number,
) =>
  ({
    id,
    dokument_id: dokumentId,
    frontend_parent_ids: [],
    gesetz_id: 'gesetz-1',
    norm_id: normId,
    satz_id: 'satz-1',
    text: 'Textauszug',
    page_numbers: [pageNumber],
    title: id,
    chunk_ids: [],
    compositeKey: toCompositeKey({ id, node_type: 'fundstelle' }),
    created_at: '2026-04-02T00:00:00.000Z',
    is_deleted: false,
    is_outdated: false,
    node_type: 'fundstelle',
    project_id: 'project-1',
    project_version: 1,
    sys_period: null,
    update_type: 'automated',
    updated_at: '2026-04-02T00:00:00.000Z',
  }) satisfies NodePayloadByType<'fundstelle'>;

describe('useFundstellenSelectionResult mode hooks', () => {
  beforeEach(() => {
    descendantsByRefKey.clear();
    fundstellenById.clear();

    const documentOnly = createFundstelle(
      'document-only',
      'document-1',
      'norm-2',
      1,
    );
    const normOnly = createFundstelle('norm-only', 'document-2', 'norm-1', 2);
    const intersection = createFundstelle(
      'intersection',
      'document-1',
      'norm-1',
      3,
    );

    for (const fundstelle of [documentOnly, normOnly, intersection]) {
      fundstellenById.set(fundstelle.id, fundstelle);
    }

    descendantsByRefKey.set('document-1', [
      { id: 'document-only', node_type: 'fundstelle' },
      { id: 'intersection', node_type: 'fundstelle' },
    ]);
    descendantsByRefKey.set('norm-1', [
      { id: 'norm-only', node_type: 'fundstelle' },
      { id: 'intersection', node_type: 'fundstelle' },
    ]);
  });

  it('returns document cards for a document-only selection', () => {
    const { result } = renderHook(() =>
      useFundstellenDocumentResult('document-1'),
    );

    expect(result.current.mode).toBe('document');
    expect(
      result.current.fundstellen.map((fundstelle) => fundstelle.id),
    ).toEqual(['document-only', 'intersection']);
    expect(result.current.fundstellenCards.map((card) => card.normId)).toEqual([
      'norm-2',
      'norm-1',
    ]);
  });

  it('returns document cards for a norm-only selection', () => {
    const { result } = renderHook(() => useFundstellenNormResult('norm-1'));

    expect(result.current.mode).toBe('norm');
    expect(
      result.current.fundstellen.map((fundstelle) => fundstelle.id),
    ).toEqual(['norm-only', 'intersection']);
    expect(
      result.current.fundstellenCards.map((card) => card.documentId),
    ).toEqual(['document-2', 'document-1']);
  });

  it('returns only intersecting fundstellen for combined selections', () => {
    const { result } = renderHook(() =>
      useFundstellenDocumentNormResult({
        selectedDocumentId: 'document-1',
        selectedNormId: 'norm-1',
      }),
    );

    expect(result.current.mode).toBe('documentAndNorm');
    expect(
      result.current.fundstellen.map((fundstelle) => fundstelle.id),
    ).toEqual(['intersection']);
    expect(result.current.entries).toEqual([
      { id: 'intersection', pageNumber: 3, title: 'intersection' },
    ]);
  });
});
