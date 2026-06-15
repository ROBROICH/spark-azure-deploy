import '@testing-library/jest-dom/vitest';

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PdfTreeNode } from '../pdfPopout.logic';
import { PdfFileTreePopover } from './PdfFileTreePopover';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const nodes: PdfTreeNode[] = [
  {
    kind: 'folder',
    id: 'folder-1',
    title: 'Folder',
    path: 'Folder',
    children: [
      {
        kind: 'document',
        id: 'document-1',
        title: 'Document one.pdf',
        path: 'Folder/Document one.pdf',
      },
    ],
  },
];

describe('PdfFileTreePopover', () => {
  it('requests files on open, selects a document, and closes the popover', async () => {
    const user = userEvent.setup();
    const onRequestFiles = vi.fn();
    const onSelectDocument = vi.fn();

    render(
      <PdfFileTreePopover
        isLoading={false}
        nodes={nodes}
        onRequestFiles={onRequestFiles}
        onSelectDocument={onSelectDocument}
      />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'PdfFileTreePopover.openTreeAria',
      }),
    );

    expect(onRequestFiles).toHaveBeenCalledOnce();
    expect(screen.getByText('PdfFileTreePopover.heading')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Document one.pdf' }));

    expect(onSelectDocument).toHaveBeenCalledWith('document-1');
    await waitFor(() =>
      expect(
        screen.queryByText('PdfFileTreePopover.heading'),
      ).not.toBeInTheDocument(),
    );
  });
});
