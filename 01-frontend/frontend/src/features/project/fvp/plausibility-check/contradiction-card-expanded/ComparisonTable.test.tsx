import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  Contradiction,
  ContradictionOccurrence,
} from '@/api-clients/pns-module';
import { ComparisonTable } from './ComparisonTable';

type ComparisonTableSearchState = {
  leftOccurrenceIndex: number | undefined;
  previewDocumentId: string | undefined;
  previewPageNumber: number | undefined;
  rightOccurrenceIndex: number | undefined;
};

const createDefaultSearchState = (): ComparisonTableSearchState => ({
  leftOccurrenceIndex: undefined,
  previewDocumentId: undefined,
  previewPageNumber: undefined,
  rightOccurrenceIndex: undefined,
});

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useSearchMock: vi.fn<() => ComparisonTableSearchState>(() =>
    createDefaultSearchState(),
  ),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: mocks.useSearchMock,
  }),
  useNavigate: () => mocks.navigateMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { index?: number; count?: number }) => {
      const translations = {
        'ComparisonTable.leftOccurrence': 'Left text passage',
        'ComparisonTable.rightOccurrence': 'Right text passage',
        'ComparisonTable.document': 'Document',
        'ComparisonTable.location': 'Location',
        'ComparisonTable.wording': 'Wording',
        'common.page': 'Page',
      } satisfies Record<string, string>;

      if (key === 'ComparisonTable.textPassageIndexed') {
        return `Text passage ${options?.index}`;
      }

      if (Object.hasOwn(translations, key)) {
        return translations[key as keyof typeof translations];
      }

      return key;
    },
  }),
}));

vi.mock('./InlinePdfViewer', () => ({
  InlinePdfViewer: (props: {
    documentId: string;
    pageNumber: number;
    label: string;
    viewerKey?: string;
  }) => {
    const { documentId, pageNumber, label, viewerKey } = props;

    return (
      <div data-testid={`pdf-${label}`} data-viewer-key={viewerKey}>
        {`PDF ${label} ${documentId} ${pageNumber}`}
      </div>
    );
  },
}));

const makeOccurrence = (index: number): ContradictionOccurrence => ({
  documentId: `doc-${index}`,
  documentName: `Dokument ${index}`,
  pageNumber: index,
  contentExcerpt: `Text ${index}`,
});

const makeContradiction = (
  occurrences: ContradictionOccurrence[],
): Contradiction => ({
  id: 'contradiction-1',
  description: 'Summary',
  status: 'OPEN',
  occurrences,
});

afterEach(() => {
  cleanup();
  mocks.navigateMock.mockReset();
  mocks.useSearchMock.mockReset();
  mocks.useSearchMock.mockReturnValue(createDefaultSearchState());
});

describe('ComparisonTable', () => {
  it('shows selectors only when more than two occurrences exist', () => {
    render(
      <ComparisonTable
        contradiction={makeContradiction([
          makeOccurrence(1),
          makeOccurrence(2),
          makeOccurrence(3),
        ])}
      />,
    );

    expect(
      screen.getByRole('combobox', { name: /^Left text passage:/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole('combobox', { name: /^Right text passage:/ }),
    ).toBeTruthy();
    expect(screen.getByText('PDF Text passage 1 doc-1 1')).toBeTruthy();
    expect(screen.getByText('PDF Text passage 2 doc-2 2')).toBeTruthy();
  });

  it('wraps long document names inside the available column width', () => {
    const longDocumentName =
      'SehrLangerDokumentennameOhneLeerzeichenMitVieleZeichenUndVersionsnummer.pdf';

    render(
      <ComparisonTable
        contradiction={makeContradiction([
          {
            ...makeOccurrence(1),
            documentName: longDocumentName,
          },
          makeOccurrence(2),
        ])}
      />,
    );

    const documentButton = screen.getByRole('button', {
      name: longDocumentName,
    });
    const documentNameText = documentButton.querySelector('span');

    expect(documentButton.className).toContain('max-w-full');
    expect(documentButton.className).toContain('whitespace-normal');
    expect(documentNameText?.className).toContain('[overflow-wrap:anywhere]');
    expect(documentNameText?.className).toContain('break-words');
  });
});

describe('ComparisonTable selector sync', () => {
  it('keeps the opposite side unchanged when the left selector changes', () => {
    render(
      <ComparisonTable
        contradiction={makeContradiction([
          makeOccurrence(1),
          makeOccurrence(2),
          makeOccurrence(3),
        ])}
      />,
    );

    fireEvent.click(
      screen.getByRole('combobox', { name: /^Left text passage:/ }),
    );
    fireEvent.click(screen.getByRole('option', { name: /Text passage 3/ }));

    const navigateArgs = mocks.navigateMock.mock.calls.at(-1)?.[0] as {
      replace: boolean;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };

    expect(navigateArgs.replace).toBe(true);
    expect(
      navigateArgs.search({
        leftOccurrenceIndex: undefined,
        rightOccurrenceIndex: undefined,
        previewDocumentId: undefined,
        previewPageNumber: undefined,
      }),
    ).toEqual({
      leftOccurrenceIndex: 2,
      rightOccurrenceIndex: undefined,
    });
  });

  it('disables the occurrence that is selected on the opposite side', () => {
    render(
      <ComparisonTable
        contradiction={makeContradiction([
          makeOccurrence(1),
          makeOccurrence(2),
          makeOccurrence(3),
        ])}
      />,
    );

    fireEvent.click(
      screen.getByRole('combobox', { name: /^Left text passage:/ }),
    );

    expect(
      screen
        .getByRole('option', { name: /Text passage 2/ })
        .getAttribute('aria-disabled'),
    ).toBe('true');
  });

  it('updates the quick view page when the active left occurrence changes', () => {
    mocks.useSearchMock.mockReturnValue({
      leftOccurrenceIndex: undefined,
      previewDocumentId: 'doc-1',
      previewPageNumber: 1,
      rightOccurrenceIndex: undefined,
    });

    render(
      <ComparisonTable
        contradiction={makeContradiction([
          makeOccurrence(1),
          makeOccurrence(2),
          makeOccurrence(3),
        ])}
      />,
    );

    fireEvent.click(
      screen.getByRole('combobox', { name: /^Left text passage:/ }),
    );
    fireEvent.click(screen.getByRole('option', { name: /Text passage 3/ }));

    expect(mocks.navigateMock).toHaveBeenCalledTimes(1);

    const quickViewNavigateArgs = mocks.navigateMock.mock.calls[0]?.[0] as {
      replace: boolean;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };

    expect(quickViewNavigateArgs.replace).toBe(true);
    expect(
      quickViewNavigateArgs.search({
        leftOccurrenceIndex: undefined,
        previewDocumentId: 'doc-1',
        previewPageNumber: 1,
        rightOccurrenceIndex: undefined,
      }),
    ).toEqual({
      leftOccurrenceIndex: 2,
      previewDocumentId: 'doc-1',
      previewPageNumber: 1,
      rightOccurrenceIndex: undefined,
    });
  });

  it('remounts the inline PDF when the selected occurrence changes on the same document page', () => {
    const contradiction = makeContradiction([
      {
        ...makeOccurrence(1),
        documentId: 'doc-shared',
        pageNumber: 135,
      },
      makeOccurrence(2),
      {
        ...makeOccurrence(3),
        documentId: 'doc-shared',
        pageNumber: 135,
      },
    ]);
    const { rerender } = render(
      <ComparisonTable contradiction={contradiction} />,
    );

    expect(
      screen.getByTestId('pdf-Text passage 1').getAttribute('data-viewer-key'),
    ).toBe('doc-shared-135-0');

    mocks.useSearchMock.mockReturnValue({
      leftOccurrenceIndex: 2,
      previewDocumentId: undefined,
      previewPageNumber: undefined,
      rightOccurrenceIndex: undefined,
    });

    rerender(<ComparisonTable contradiction={contradiction} />);

    expect(
      screen.getByTestId('pdf-Text passage 3').getAttribute('data-viewer-key'),
    ).toBe('doc-shared-135-2');
  });
});

describe('ComparisonTable navigation', () => {
  it('unmounts inline PDF previews while quick view is open', () => {
    mocks.useSearchMock.mockReturnValue({
      leftOccurrenceIndex: undefined,
      previewDocumentId: 'doc-1',
      previewPageNumber: 1,
      rightOccurrenceIndex: undefined,
    });

    render(
      <ComparisonTable
        contradiction={makeContradiction([
          makeOccurrence(1),
          makeOccurrence(2),
        ])}
      />,
    );

    expect(screen.queryByText(/^PDF /)).toBeNull();
  });

  it('opens quick view for the selected occurrence', () => {
    render(
      <ComparisonTable
        contradiction={makeContradiction([
          makeOccurrence(1),
          makeOccurrence(2),
        ])}
      />,
    );

    const documentButton = screen.getAllByText('Dokument 2').at(0);
    expect(documentButton).toBeDefined();
    fireEvent.click(documentButton as HTMLElement);

    expect(mocks.navigateMock).toHaveBeenCalledTimes(1);

    const navigateArgs = mocks.navigateMock.mock.calls[0]?.[0] as {
      to: string;
      resetScroll: boolean;
      search: (prev: Record<string, unknown>) => Record<string, unknown>;
    };

    expect(navigateArgs.to).toBe('.');
    expect(navigateArgs.resetScroll).toBe(false);
    expect(navigateArgs.search({ search: 'abc' })).toEqual({
      search: 'abc',
      previewDocumentId: 'doc-2',
      previewPageNumber: 2,
    });
  });

  it('does not show selectors when only two occurrences exist', () => {
    render(
      <ComparisonTable
        contradiction={makeContradiction([
          makeOccurrence(1),
          makeOccurrence(2),
        ])}
      />,
    );

    expect(
      screen.queryByRole('combobox', { name: /^Left text passage:/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('combobox', { name: /^Right text passage:/ }),
    ).toBeNull();
  });
});
