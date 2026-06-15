import '@testing-library/jest-dom/vitest';

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PdfDarkFileTreeDropdown } from './PdfDarkFileTreeDropdown';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../PdfPopoutWorkspaceContext', () => ({
  usePdfPopout: () => ({
    tree: [],
    isLoadingFiles: false,
    isFilesError: false,
    recentDocuments: [],
    selectPaneDocument: vi.fn(),
    requestFileCatalog: vi.fn(),
  }),
}));

describe('PdfDarkFileTreeDropdown', () => {
  it('keeps the dropdown trigger focus visible', () => {
    render(
      <PdfDarkFileTreeDropdown
        paneId="pane-1"
        documentId="document-1"
        title="Document one.pdf"
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'PdfDarkFileTreeDropdown.triggerAria',
      }),
    ).toHaveClass('focus-ring');
  });
});
