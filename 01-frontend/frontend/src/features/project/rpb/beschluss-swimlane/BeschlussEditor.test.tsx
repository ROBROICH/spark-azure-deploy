import type { TiptapEditorHTMLElement } from '@tiptap/core';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { invariant } from 'es-toolkit/util';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type { BeschlussContent, BeschlussSection } from '../rpbBeschluss.types';
import { BeschlussEditor } from './BeschlussEditor';
import { getFirstParagraphSelectionPos } from './beschlussEditorExtensions';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

const makeSection = (
  outlineNodeId: string,
  title: string,
  text: string,
  content: BeschlussSection['content'] = null,
): BeschlussSection => ({
  content,
  depth: 0,
  index: 0,
  isEditable: true,
  order: 0,
  parentVaeNodeId: null,
  text,
  title,
  vaeNodeId: outlineNodeId,
});

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
    configurable: true,
    value: vi.fn(),
  });

  globalThis.requestAnimationFrame = (callback) => {
    callback(0);
    return 0;
  };
});

afterAll(() => {
  globalThis.requestAnimationFrame = originalRequestAnimationFrame;
});

afterEach(cleanup);

const OUTLINE_NODE_IDS = ['node-a', 'node-b'];

const paragraphDocument = (
  content: NonNullable<BeschlussContent['content'][0]['content']>,
): BeschlussContent => ({
  type: 'doc',
  content: [{ type: 'paragraph', content }],
});

const boldAlphaContent = paragraphDocument([
  { type: 'text', marks: [{ type: 'bold' }], text: 'Alpha paragraph' },
]);

const plainParagraph = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

const renderEditor = (
  sections: BeschlussSection[],
  onContentCommit: (
    outlineNodeId: string,
    nextContent: BeschlussContent,
  ) => void,
) => {
  const renderElement = (nextSections: BeschlussSection[]) => (
    <BeschlussEditor
      canExport={true}
      sections={nextSections}
      selectedVaeNodeId="node-a"
      onVaeNodeSelect={vi.fn()}
      onExportClick={vi.fn()}
      onContentCommit={onContentCommit}
    />
  );
  const { rerender, unmount } = render(renderElement(sections));

  return {
    rerender: (nextSections: BeschlussSection[]) => {
      rerender(renderElement(nextSections));
    },
    unmount,
  };
};

const getEditorElement = () =>
  screen.getByLabelText<TiptapEditorHTMLElement>('beschluss.editorAriaLabel');

const getEditor = () => {
  const { editor } = getEditorElement();
  invariant(editor, 'Expected the TipTap editor on its DOM element');
  return editor;
};

const getSectionParagraph = (sectionIndex: number) =>
  getEditor()
    .state.doc.child(sectionIndex * 2 + 1)
    .toJSON();

const selectSectionText = (outlineNodeId: string, text: string) => {
  const editor = getEditor();
  const from = getFirstParagraphSelectionPos(
    editor.state.doc,
    outlineNodeId,
    OUTLINE_NODE_IDS,
  );
  editor.commands.setTextSelection({ from, to: from + text.length });
};

const applyBoldToSection = (outlineNodeId: string, text: string) => {
  selectSectionText(outlineNodeId, text);
  getEditor().commands.toggleBold();
};

const appendToSection = (
  outlineNodeId: string,
  currentText: string,
  addition: string,
) => {
  const editor = getEditor();
  const from = getFirstParagraphSelectionPos(
    editor.state.doc,
    outlineNodeId,
    OUTLINE_NODE_IDS,
  );
  editor.commands.insertContentAt(from + currentText.length, addition);
};

describe('BeschlussEditor', () => {
  it('moves the focused paragraph on every external vae node selection without echoing the callback', async () => {
    const onVaeNodeSelect = vi.fn();
    const sections = [
      makeSection('node-a', 'A. Tenor', 'Alpha paragraph'),
      makeSection('node-b', 'B. Begruendung', 'Beta paragraph'),
    ];
    const { rerender } = render(
      <BeschlussEditor
        canExport={true}
        sections={sections}
        selectedVaeNodeId="node-a"
        onVaeNodeSelect={onVaeNodeSelect}
        onExportClick={vi.fn()}
        onContentCommit={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByText('Alpha paragraph')
          .classList.contains('rpb-outline-paragraph-focused'),
      ).toBe(true);
    });

    onVaeNodeSelect.mockClear();

    rerender(
      <BeschlussEditor
        canExport={true}
        sections={sections}
        selectedVaeNodeId="node-b"
        onVaeNodeSelect={onVaeNodeSelect}
        onExportClick={vi.fn()}
        onContentCommit={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByText('Beta paragraph')
          .classList.contains('rpb-outline-paragraph-focused'),
      ).toBe(true);
    });

    expect(onVaeNodeSelect).not.toHaveBeenCalled();

    rerender(
      <BeschlussEditor
        canExport={true}
        sections={sections}
        selectedVaeNodeId="node-a"
        onVaeNodeSelect={onVaeNodeSelect}
        onExportClick={vi.fn()}
        onContentCommit={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByText('Alpha paragraph')
          .classList.contains('rpb-outline-paragraph-focused'),
      ).toBe(true);
    });

    expect(onVaeNodeSelect).not.toHaveBeenCalled();
  });

  it('renders the export action beside the saved badge and wires the click handler', () => {
    const onExportClick = vi.fn();

    render(
      <BeschlussEditor
        canExport={true}
        sections={[makeSection('node-a', 'A. Tenor', 'Alpha paragraph')]}
        selectedVaeNodeId="node-a"
        onVaeNodeSelect={vi.fn()}
        onExportClick={onExportClick}
        onContentCommit={vi.fn()}
      />,
    );

    expect(screen.getByText('beschluss.savedBadge')).toBeDefined();

    const exportButton = screen.getByRole('button', {
      name: 'beschluss.export',
    });
    expect((exportButton as HTMLButtonElement).disabled).toBe(false);

    exportButton.click();

    expect(onExportClick).toHaveBeenCalledTimes(1);
  });

  it('disables the export action when export is not allowed', () => {
    const onExportClick = vi.fn();

    render(
      <BeschlussEditor
        canExport={false}
        sections={[makeSection('node-a', 'A. Tenor', 'Alpha paragraph')]}
        selectedVaeNodeId="node-a"
        onVaeNodeSelect={vi.fn()}
        onExportClick={onExportClick}
        onContentCommit={vi.fn()}
      />,
    );

    const exportButton = screen.getByRole('button', {
      name: 'beschluss.export',
    });
    expect((exportButton as HTMLButtonElement).disabled).toBe(true);

    exportButton.click();

    expect(onExportClick).not.toHaveBeenCalled();
  });

  it('keeps Ctrl+A text selection inside the editor without changing the outline node', async () => {
    const onVaeNodeSelect = vi.fn();

    render(
      <BeschlussEditor
        canExport={true}
        sections={[
          makeSection('node-a', 'A. Tenor', 'Alpha paragraph'),
          makeSection('node-b', 'B. Begruendung', 'Beta paragraph'),
        ]}
        selectedVaeNodeId="node-b"
        onVaeNodeSelect={onVaeNodeSelect}
        onExportClick={vi.fn()}
        onContentCommit={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByText('Beta paragraph')
          .classList.contains('rpb-outline-paragraph-focused'),
      ).toBe(true);
    });

    onVaeNodeSelect.mockClear();
    fireEvent.keyDown(screen.getByLabelText('beschluss.editorAriaLabel'), {
      ctrlKey: true,
      key: 'a',
    });

    expect(onVaeNodeSelect).not.toHaveBeenCalled();
  });

  describe('formatted content', () => {
    const betaSection = makeSection(
      'node-b',
      'B. Begruendung',
      'Beta paragraph',
    );
    const sections = [
      makeSection('node-a', 'A. Tenor', 'Alpha paragraph'),
      betaSection,
    ];

    it('commits a formatting-only change on blur', async () => {
      const onContentCommit = vi.fn();
      renderEditor(sections, onContentCommit);
      await waitFor(() => {
        expect(
          screen
            .getByText('Alpha paragraph')
            .classList.contains('rpb-outline-paragraph-focused'),
        ).toBe(true);
      });

      fireEvent.focus(getEditorElement());
      applyBoldToSection('node-a', 'Alpha paragraph');
      fireEvent.blur(getEditorElement());

      expect(onContentCommit).toHaveBeenCalledTimes(1);
      expect(onContentCommit).toHaveBeenCalledWith('node-a', boldAlphaContent);
    });

    it('keeps the formatting of a section when another section saves', async () => {
      const { rerender } = renderEditor(sections, vi.fn());
      await waitFor(() => {
        expect(
          screen
            .getByText('Alpha paragraph')
            .classList.contains('rpb-outline-paragraph-focused'),
        ).toBe(true);
      });

      fireEvent.focus(getEditorElement());
      applyBoldToSection('node-a', 'Alpha paragraph');
      fireEvent.blur(getEditorElement());
      rerender([
        makeSection('node-a', 'A. Tenor', 'Alpha paragraph', boldAlphaContent),
        makeSection(
          'node-b',
          'B. Begruendung',
          'Beta saved',
          paragraphDocument([{ type: 'text', text: 'Beta saved' }]),
        ),
      ]);

      expect(getSectionParagraph(1)).toEqual(plainParagraph('Beta saved'));
      expect(getSectionParagraph(0)).toEqual(boldAlphaContent.content[0]);
    });

    it('shows persisted formatting after the editor mounts again', () => {
      const persistedSections = [
        makeSection('node-a', 'A. Tenor', 'Alpha paragraph', boldAlphaContent),
        makeSection('node-b', 'B. Begruendung', 'Beta paragraph'),
      ];
      const { unmount } = renderEditor(persistedSections, vi.fn());
      unmount();

      renderEditor(persistedSections, vi.fn());

      expect(getSectionParagraph(0)).toEqual(boldAlphaContent.content[0]);
    });

    it('sends no update for an untouched section without formatted content', async () => {
      const onContentCommit = vi.fn();
      renderEditor(sections, onContentCommit);
      await waitFor(() => {
        expect(
          screen
            .getByText('Alpha paragraph')
            .classList.contains('rpb-outline-paragraph-focused'),
        ).toBe(true);
      });

      fireEvent.focus(getEditorElement());
      fireEvent.blur(getEditorElement());

      expect(onContentCommit).not.toHaveBeenCalled();
    });

    it('adopts saved content with reordered keys without a second save or a content reset', async () => {
      const onContentCommit = vi.fn();
      const { rerender } = renderEditor(sections, onContentCommit);
      await waitFor(() => {
        expect(
          screen
            .getByText('Alpha paragraph')
            .classList.contains('rpb-outline-paragraph-focused'),
        ).toBe(true);
      });

      fireEvent.focus(getEditorElement());
      appendToSection('node-a', 'Alpha paragraph', '!');
      fireEvent.blur(getEditorElement());
      const documentAfterSave = getEditor().state.doc;
      // PostgreSQL jsonb returns object keys ordered by length, then bytewise.
      rerender([
        makeSection('node-a', 'A. Tenor', 'Alpha paragraph!', {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ text: 'Alpha paragraph!', type: 'text' }],
            },
          ],
        }),
        betaSection,
      ]);
      fireEvent.focus(getEditorElement());
      fireEvent.blur(getEditorElement());

      expect(onContentCommit).toHaveBeenCalledTimes(1);
      expect(getEditor().state.doc).toBe(documentAfterSave);
    });

    it('commits focused formatting before applying deferred external content on blur', async () => {
      const onContentCommit = vi.fn();
      const { rerender } = renderEditor(sections, onContentCommit);
      await waitFor(() => {
        expect(
          screen
            .getByText('Alpha paragraph')
            .classList.contains('rpb-outline-paragraph-focused'),
        ).toBe(true);
      });

      fireEvent.focus(getEditorElement());
      applyBoldToSection('node-a', 'Alpha paragraph');
      rerender([
        makeSection('node-a', 'A. Tenor', 'Alpha paragraph'),
        makeSection('node-b', 'B. Begruendung', 'Beta external'),
      ]);
      fireEvent.blur(getEditorElement());

      expect(onContentCommit).toHaveBeenCalledTimes(1);
      expect(onContentCommit).toHaveBeenCalledWith('node-a', boldAlphaContent);
      expect(getSectionParagraph(1)).toEqual(plainParagraph('Beta external'));

      // The deferred snapshot predates the edit; the committed content must come back through `sections`.
      rerender([
        makeSection('node-a', 'A. Tenor', 'Alpha paragraph', boldAlphaContent),
        makeSection('node-b', 'B. Begruendung', 'Beta external'),
      ]);
      selectSectionText('node-a', 'Alpha paragraph');
      fireEvent.focus(getEditorElement());
      fireEvent.blur(getEditorElement());

      expect(getSectionParagraph(0)).toEqual(boldAlphaContent.content[0]);
      expect(onContentCommit).toHaveBeenCalledTimes(1);
    });

    it('drops the formatting when a section loses its formatted content', () => {
      const { rerender } = renderEditor(
        [
          makeSection(
            'node-a',
            'A. Tenor',
            'Alpha paragraph',
            boldAlphaContent,
          ),
          makeSection('node-b', 'B. Begruendung', 'Beta paragraph'),
        ],
        vi.fn(),
      );

      expect(getSectionParagraph(0)).toEqual(boldAlphaContent.content[0]);

      rerender(sections);

      expect(getSectionParagraph(0)).toEqual(plainParagraph('Alpha paragraph'));
    });

    it('defers external content while focused and applies it on blur', async () => {
      const { rerender } = renderEditor(sections, vi.fn());
      await waitFor(() => {
        expect(
          screen
            .getByText('Alpha paragraph')
            .classList.contains('rpb-outline-paragraph-focused'),
        ).toBe(true);
      });

      fireEvent.focus(getEditorElement());
      rerender([
        makeSection('node-a', 'A. Tenor', 'Alpha paragraph'),
        makeSection('node-b', 'B. Begruendung', 'Beta external'),
      ]);

      expect(getSectionParagraph(1)).toEqual(plainParagraph('Beta paragraph'));

      fireEvent.blur(getEditorElement());

      expect(getSectionParagraph(1)).toEqual(plainParagraph('Beta external'));
    });
  });
});
