import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PdfQuickView } from './PdfQuickView';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

beforeEach(() => {
  window.__APP_CONFIG__ = {
    VITE_ALLOWED_DOWNLOAD_ORIGINS: 'https://example.test',
  };
});

afterEach(() => {
  cleanup();
  window.__APP_CONFIG__ = undefined;
});

describe('PdfQuickView', () => {
  it('adds a page hash when pageNumber is provided', () => {
    render(
      <PdfQuickView
        title="Preview document"
        pdfUrl="https://example.test/document.pdf"
        pageNumber={7}
        onClose={vi.fn()}
      />,
    );

    const iframe = screen.getByTitle('Preview document');

    expect(iframe).toHaveAttribute(
      'src',
      'https://example.test/document.pdf#page=7',
    );
    expect(iframe).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(iframe).not.toHaveAttribute('sandbox');
  });

  it('renders the loading skeleton without an iframe', () => {
    const { container } = render(
      <PdfQuickView
        title="Preview document"
        pdfUrl="https://example.test/document.pdf"
        isLoading
        onClose={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-slot="skeleton"]')).toBeTruthy();
    expect(screen.queryByTitle('Preview document')).not.toBeInTheDocument();
  });

  it('renders the missing-document empty state when no PDF URL is available', () => {
    render(
      <PdfQuickView
        title="Preview document"
        pdfUrl={undefined}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText('PdfQuickView.documentNotFound'),
    ).toBeInTheDocument();
    expect(screen.queryByTitle('Preview document')).not.toBeInTheDocument();
  });
});
