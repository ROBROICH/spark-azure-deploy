import type { Editor } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';

import type { RequestItem } from '@/features/project/nachforderungen/data/schemas/requestItem.schema';
import {
  generateItemSectionHtml,
  generateLetterHtml,
  insertSection,
  removeSections,
  syncEditorContent,
  type LetterLabels,
} from './letterHtml';

const labels: LetterLabels = {
  reasonLabel: 'Reason:',
};

const requestItem = (id: string, title: string): RequestItem => ({
  id,
  projectId: 'project-1',
  priority: 'must',
  title,
  reason: `${title} reason`,
  createdAt: new Date('2026-03-12T12:00:00.000Z'),
  includedInLetter: true,
});

describe('generateLetterHtml', () => {
  it('renders request items in list order', () => {
    const html = generateLetterHtml(
      [requestItem('item-1', 'First'), requestItem('item-2', 'Second')],
      labels,
    );

    expect(html).toBe(
      '<section data-item-id="item-1"><h2>First</h2><p><strong>Reason:</strong> First reason</p></section>' +
        '<section data-item-id="item-2"><h2>Second</h2><p><strong>Reason:</strong> Second reason</p></section>',
    );
  });
});

describe('generateItemSectionHtml escaping', () => {
  it('escapes markup in the title so it cannot inject new elements', () => {
    const item: RequestItem = {
      ...requestItem('item-1', 'safe'),
      title: '<script>alert(1)</script>',
    };

    const html = generateItemSectionHtml(item, labels.reasonLabel);

    expect(html).not.toContain('<script>');
    expect(html).toContain('<h2>&lt;script&gt;alert(1)&lt;/script&gt;</h2>');
  });

  it('escapes quotes and markup in the reason so it stays inside the paragraph', () => {
    const item: RequestItem = {
      ...requestItem('item-1', 'safe'),
      reason: 'broken "quote" </p><img src=x onerror=alert(1)>',
    };

    const html = generateItemSectionHtml(item, labels.reasonLabel);

    expect(html).not.toContain('<img');
    expect(html).not.toContain('</p><img');
    expect(html).toContain(
      'broken &quot;quote&quot; &lt;/p&gt;&lt;img src=x onerror=alert(1)&gt;',
    );
  });

  it('escapes the reason label so a crafted label cannot add markup', () => {
    const item = requestItem('item-1', 'safe');

    const html = generateItemSectionHtml(item, '</strong><b>injected</b>');

    expect(html).not.toContain('<b>injected</b>');
    expect(html).toContain(
      '<strong>&lt;/strong&gt;&lt;b&gt;injected&lt;/b&gt;</strong>',
    );
  });

  it('escapes the item id so a crafted id cannot break out of the data attribute', () => {
    const item: RequestItem = {
      ...requestItem(
        '"><img src=x onerror=alert(1)><section data-item-id="x',
        'safe',
      ),
    };

    const html = generateItemSectionHtml(item, labels.reasonLabel);

    // The crafted id must remain a single quoted attribute value, not a new tag.
    expect(html).not.toContain('<img');
    expect(html).toContain(
      'data-item-id="&quot;&gt;&lt;img src=x onerror=alert(1)&gt;&lt;section data-item-id=&quot;x"',
    );
  });
});

describe('insertSection', () => {
  it('inserts a new section after the previous visible item in list order', () => {
    const insertContentAt = vi.fn().mockReturnValue({
      run: vi.fn(),
    });
    const editor = {
      state: {
        doc: {
          content: { size: 100 },
          descendants: (
            callback: (node: never, pos: number) => boolean | void,
          ) => {
            callback(
              {
                type: { name: 'itemSection' },
                attrs: { itemId: 'item-1' },
                nodeSize: 10,
              } as never,
              5,
            );
            return undefined;
          },
        },
      },
      chain: () => ({
        insertContentAt,
      }),
    } as unknown as Editor;

    insertSection(
      editor,
      requestItem('item-2', 'Second'),
      [requestItem('item-1', 'First'), requestItem('item-2', 'Second')],
      labels,
    );

    expect(insertContentAt).toHaveBeenCalledWith(
      15,
      expect.stringContaining('data-item-id="item-2"'),
    );
  });

  it('inserts before the next visible item when there is no previous section', () => {
    const insertContentAt = vi.fn().mockReturnValue({
      run: vi.fn(),
    });
    const editor = {
      state: {
        doc: {
          content: { size: 100 },
          descendants: (
            callback: (node: never, pos: number) => boolean | void,
          ) => {
            callback(
              {
                type: { name: 'itemSection' },
                attrs: { itemId: 'item-2' },
                nodeSize: 10,
              } as never,
              20,
            );
            return undefined;
          },
        },
      },
      chain: () => ({
        insertContentAt,
      }),
    } as unknown as Editor;

    insertSection(
      editor,
      requestItem('item-1', 'First'),
      [requestItem('item-1', 'First'), requestItem('item-2', 'Second')],
      labels,
    );

    expect(insertContentAt).toHaveBeenCalledWith(
      20,
      expect.stringContaining('data-item-id="item-1"'),
    );
  });
});

type SectionNode = {
  type: { name: string };
  attrs: { itemId: string };
  nodeSize: number;
};

/**
 * Builds a minimal TipTap editor double whose document contains the given item
 * sections. Records transaction deletions and dispatches so removal behavior can
 * be asserted without a real ProseMirror instance.
 */
const createEditorWithSections = (
  sections: { id: string; pos: number; nodeSize: number }[],
) => {
  const deletedRanges: { from: number; to: number }[] = [];
  const dispatch = vi.fn();
  const setContent = vi.fn();
  const insertContentAt = vi.fn().mockReturnValue({ run: vi.fn() });

  const tr = {
    delete: vi.fn((from: number, to: number) => {
      deletedRanges.push({ from, to });
      return tr;
    }),
  };

  const editor = {
    commands: { setContent },
    chain: () => ({ insertContentAt }),
    view: { dispatch },
    state: {
      tr,
      doc: {
        content: { size: 1000 },
        descendants: (
          callback: (node: SectionNode, pos: number) => boolean | void,
        ) => {
          for (const section of sections) {
            callback(
              {
                type: { name: 'itemSection' },
                attrs: { itemId: section.id },
                nodeSize: section.nodeSize,
              },
              section.pos,
            );
          }
          return undefined;
        },
      },
    },
  } as unknown as Editor;

  return { editor, deletedRanges, dispatch, setContent, insertContentAt };
};

describe('removeSections', () => {
  it('deletes only matching sections, in reverse position order, in one dispatch', () => {
    const { editor, deletedRanges, dispatch } = createEditorWithSections([
      { id: 'item-1', pos: 0, nodeSize: 10 },
      { id: 'item-2', pos: 10, nodeSize: 20 },
      { id: 'item-3', pos: 30, nodeSize: 5 },
    ]);

    removeSections(editor, ['item-1', 'item-3']);

    // Reverse order keeps earlier positions valid while later ones are removed.
    expect(deletedRanges).toEqual([
      { from: 30, to: 35 },
      { from: 0, to: 10 },
    ]);
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('does not dispatch when no section matches', () => {
    const { editor, deletedRanges, dispatch } = createEditorWithSections([
      { id: 'item-1', pos: 0, nodeSize: 10 },
    ]);

    removeSections(editor, ['missing']);

    expect(deletedRanges).toEqual([]);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('syncEditorContent', () => {
  it('sets the full letter content on first run and reports initialization', () => {
    const { editor, setContent } = createEditorWithSections([]);
    const items = [requestItem('item-1', 'First')];

    const result = syncEditorContent(
      editor,
      items,
      new Set<string>(),
      false,
      labels,
    );

    expect(setContent).toHaveBeenCalledWith(generateLetterHtml(items, labels));
    expect(result).toEqual({
      newIds: new Set(['item-1']),
      wasInitialized: true,
    });
  });

  it('is a no-op when the included set is unchanged after initialization', () => {
    const { editor, setContent, dispatch, insertContentAt } =
      createEditorWithSections([{ id: 'item-1', pos: 0, nodeSize: 10 }]);
    const items = [requestItem('item-1', 'First')];

    const result = syncEditorContent(
      editor,
      items,
      new Set(['item-1']),
      true,
      labels,
    );

    expect(setContent).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(insertContentAt).not.toHaveBeenCalled();
    expect(result).toEqual({
      newIds: new Set(['item-1']),
      wasInitialized: true,
    });
  });

  it('removes sections for items that left the included set', () => {
    const { editor, deletedRanges, dispatch, setContent } =
      createEditorWithSections([
        { id: 'item-1', pos: 0, nodeSize: 10 },
        { id: 'item-2', pos: 10, nodeSize: 10 },
      ]);

    const result = syncEditorContent(
      editor,
      [requestItem('item-1', 'First')],
      new Set(['item-1', 'item-2']),
      true,
      labels,
    );

    expect(setContent).not.toHaveBeenCalled();
    expect(deletedRanges).toEqual([{ from: 10, to: 20 }]);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(result).toEqual({
      newIds: new Set(['item-1']),
      wasInitialized: true,
    });
  });

  it('inserts sections for items added to the included set', () => {
    const { editor, insertContentAt, dispatch } = createEditorWithSections([
      { id: 'item-1', pos: 0, nodeSize: 10 },
    ]);

    const result = syncEditorContent(
      editor,
      [requestItem('item-1', 'First'), requestItem('item-2', 'Second')],
      new Set(['item-1']),
      true,
      labels,
    );

    expect(dispatch).not.toHaveBeenCalled();
    expect(insertContentAt).toHaveBeenCalledWith(
      10,
      expect.stringContaining('data-item-id="item-2"'),
    );
    expect(result).toEqual({
      newIds: new Set(['item-1', 'item-2']),
      wasInitialized: true,
    });
  });
});
