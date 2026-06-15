import { describe, expect, it } from 'vitest';
import type { RowNode } from './columns.shared';
import { projectAndFilterNodes } from './DocumentsTable.filters';

const createDocumentNode = (
  overrides: Partial<Extract<RowNode, { kind: 'document' }>>,
) => ({
  kind: 'document' as const,
  id: 'doc-1',
  filename: 'document.pdf',
  status: 'Zugeordnet' as const,
  ...overrides,
});

describe('projectAndFilterNodes document type filtering', () => {
  it('matches documents by stable type id even when the label contains commas', () => {
    const nodes = [
      {
        kind: 'folder' as const,
        id: 'folder-1',
        path: 'incoming',
        title: 'Incoming',
        children: [
          {
            kind: 'document' as const,
            id: 'doc-1',
            filename: 'alternativen.pdf',
            status: 'Zugeordnet' as const,
            linkedDocumentType: {
              id: 'type-alternatives',
              name: '(Ggf. Alternativen- / Variantsprufung bzw. Beschreibung der relevanten, vernunftigen, gepruften Alternativen)',
              humanApproved: true,
            },
          },
          {
            kind: 'document' as const,
            id: 'doc-2',
            filename: 'wasser.pdf',
            status: 'Zugeordnet' as const,
            linkedDocumentType: {
              id: 'type-water',
              name: 'Wassertechnische Untersuchung',
              humanApproved: true,
            },
          },
        ],
      },
    ];

    const filteredNodes = projectAndFilterNodes(
      nodes,
      '',
      ['type-alternatives'],
      [],
      new Set(),
    );

    expect(filteredNodes).toHaveLength(1);
    expect(filteredNodes[0]).toMatchObject({
      kind: 'folder',
      children: [{ id: 'doc-1' }],
    });
  });
});

describe('projectAndFilterNodes request-list projection', () => {
  it('projects requested assigned documents before status filtering', () => {
    const nodes = [
      createDocumentNode({
        id: 'doc-requested',
        filename: 'requested.pdf',
      }),
      createDocumentNode({
        id: 'doc-other',
        filename: 'other.pdf',
      }),
    ];

    const filteredNodes = projectAndFilterNodes(
      nodes,
      '',
      [],
      ['Auf Nachforderungsliste'],
      new Set(['doc-requested']),
    );

    expect(filteredNodes).toEqual([
      expect.objectContaining({
        id: 'doc-requested',
        status: 'Auf Nachforderungsliste',
      }),
    ]);
  });

  it('does not project deleted or unassigned requested documents', () => {
    const nodes = [
      createDocumentNode({
        id: 'doc-deleted',
        status: 'Gelöscht',
      }),
      createDocumentNode({
        id: 'doc-unassigned',
        status: 'Nicht zugeordnet',
      }),
    ];

    const filteredNodes = projectAndFilterNodes(
      nodes,
      '',
      [],
      ['Auf Nachforderungsliste'],
      new Set(['doc-deleted', 'doc-unassigned']),
    );

    expect(filteredNodes).toEqual([]);
  });
});
