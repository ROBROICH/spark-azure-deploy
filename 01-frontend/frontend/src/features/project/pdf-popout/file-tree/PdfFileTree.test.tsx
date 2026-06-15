import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PdfTreeNode } from '../pdfPopout.logic';
import { PdfFileTree } from './PdfFileTree';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const nodes: PdfTreeNode[] = [
  {
    kind: 'document',
    id: 'document-1',
    title: 'Document one.pdf',
    path: 'Document one.pdf',
  },
  {
    kind: 'document',
    id: 'document-2',
    title: 'Document two.pdf',
    path: 'Document two.pdf',
  },
];

describe('PdfFileTree', () => {
  it('keeps recent rows, document rows, pop-in, and close controls focus visible', () => {
    render(
      <PdfFileTree
        nodes={nodes}
        recentDocuments={[
          { documentId: 'recent-document', title: 'Recent document.pdf' },
        ]}
        selectedDocumentId="recent-document"
        connectedFileId="document-1"
        openDocumentIds={new Set(['document-2'])}
        onSelectDocument={vi.fn()}
        onPopIn={vi.fn()}
        onCloseDocument={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Recent document.pdf' }),
    ).toHaveClass('focus-ring');
    expect(
      screen.getByRole('button', { name: 'Document one.pdf' }),
    ).toHaveClass('focus-ring');
    expect(
      screen.getByRole('button', { name: 'PdfFileTree.popInAria' }),
    ).toHaveClass('focus-ring');
    expect(
      screen.getByRole('button', { name: 'PdfFileTree.closeLaneAria' }),
    ).toHaveClass('focus-ring');
  });
});
