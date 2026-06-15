import { toCompositeKey } from '@/db/nodes/compositeKey';
import { describe, expect, it } from 'vitest';
import type { NodePayloadByType } from '@/db/nodes/types';
import {
  createBewertungReferenceMap,
  getDistinctReferenceIdsFromMarkdown,
} from './aiReferenceLinks';

const createBewertungQuelle = (
  id: string,
  dokumentId: string,
  title: string,
  pageNumbers: number[],
  citedSvmId: string | null = null,
) => {
  return {
    id,
    node_type: 'bewertung_quelle',
    bewertung_id: 'bewertung-1',
    dokument_id: dokumentId,
    fundstelle_id: null,
    title,
    cited_svm_id: citedSvmId,
    chunk_ids: [`chunk-${id}`],
    page_numbers: pageNumbers,
    project_id: 'project-1',
    is_deleted: false,
    frontend_parent_ids: [],
    update_type: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    sys_period: null,
    compositeKey: toCompositeKey({ id, node_type: 'bewertung_quelle' }),
  } satisfies NodePayloadByType<'bewertung_quelle'>;
};

const createDokument = (id: string, filename: string) => {
  return {
    id,
    node_type: 'dokument',
    document_id: null,
    filename,
    dms_file_id: `file-${id}`,
    mime_type: 'application/pdf',
    page_count: 1,
    document_type: null,
    summary: '',
    markdown_text_id: `markdown-${id}`,
    is_toc_document: false,
    project_id: 'project-1',
    is_deleted: false,
    frontend_parent_ids: [],
    update_type: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    sys_period: null,
    compositeKey: toCompositeKey({ id, node_type: 'dokument' }),
  } satisfies NodePayloadByType<'dokument'>;
};

describe('getDistinctReferenceIdsFromMarkdown', () => {
  it('normalizes duplicate plain and padded reference ids', () => {
    expect(
      getDistinctReferenceIdsFromMarkdown(['Siehe [0002] sowie erneut [2].']),
    ).toEqual(['2']);
  });
});

describe('createBewertungReferenceMap', () => {
  it('skips already used ids when fallback numbering would collide with sparse markdown ids', () => {
    const references = createBewertungReferenceMap(
      [
        createBewertungQuelle('quelle-1', 'dokument-1', 'Quelle 1', [5]),
        createBewertungQuelle('quelle-2', 'dokument-2', 'Quelle 2', [9]),
      ],
      [
        createDokument('dokument-1', 'Dokument 1.pdf'),
        createDokument('dokument-2', 'Dokument 2.pdf'),
      ],
      ['Nur die zweite Quelle ist zitiert [2].'],
    );

    expect(references['2']?.node_id).toBe('quelle-1');
    expect(references['0002']?.node_id).toBe('quelle-1');
    expect(references['3']?.node_id).toBe('quelle-2');
    expect(references['0003']?.node_id).toBe('quelle-2');
  });

  it('uses cited_svm_id for direct mapping when available', () => {
    const references = createBewertungReferenceMap(
      [
        createBewertungQuelle(
          'quelle-1',
          'dokument-1',
          'Quelle 1',
          [5],
          '0061',
        ),
        createBewertungQuelle(
          'quelle-2',
          'dokument-2',
          'Quelle 2',
          [9],
          '0003',
        ),
      ],
      [
        createDokument('dokument-1', 'Dokument 1.pdf'),
        createDokument('dokument-2', 'Dokument 2.pdf'),
      ],
      ['Siehe [0061] und [0003].'],
    );

    expect(references['61']?.node_id).toBe('quelle-1');
    expect(references['0061']?.node_id).toBe('quelle-1');
    expect(references['3']?.node_id).toBe('quelle-2');
    expect(references['0003']?.node_id).toBe('quelle-2');
  });

  it('falls back to positional matching when cited_svm_id is null', () => {
    const references = createBewertungReferenceMap(
      [
        createBewertungQuelle('quelle-1', 'dokument-1', 'Quelle 1', [5], null),
        createBewertungQuelle(
          'quelle-2',
          'dokument-2',
          'Quelle 2',
          [9],
          '0042',
        ),
      ],
      [
        createDokument('dokument-1', 'Dokument 1.pdf'),
        createDokument('dokument-2', 'Dokument 2.pdf'),
      ],
      ['Erste [7] dann [0042].'],
    );

    // quelle-1 has no cited_svm_id → falls back to positional (first markdown ref = 7)
    expect(references['7']?.node_id).toBe('quelle-1');
    expect(references['0007']?.node_id).toBe('quelle-1');
    // quelle-2 has cited_svm_id → direct mapping
    expect(references['42']?.node_id).toBe('quelle-2');
    expect(references['0042']?.node_id).toBe('quelle-2');
  });
});
