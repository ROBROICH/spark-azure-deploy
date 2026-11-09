import { Editor, getSchema, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { describe, expect, it, vi } from 'vitest';
import type { BeschlussContent, BeschlussSection } from '../rpbBeschluss.types';
import {
  buildEditorContent,
  buildStructureTemplate,
  createStructureGuardExtension,
  extractNodeTexts,
  getFirstParagraphSelectionPos,
  getOutlineNodeIdAtPosition,
  matchesStructureTemplate,
  PastePlainTextAsHardBreaksExtension,
  ParagraphSelectAllExtension,
  TextareaEnterExtension,
  textToParagraphContent,
} from './beschlussEditorExtensions';
import {
  beschlussStarterKit,
  createBeschlussEditorExtensions,
} from './beschlussEditorExtensionList';

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

// Shared literal with backend test I.2 (implementation/backend.md, Handovers); keep both copies identical.
const canonicalFormattedContent: BeschlussContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', marks: [{ type: 'bold' }], text: 'Fett' },
        { type: 'text', text: ' und ' },
        { type: 'text', marks: [{ type: 'italic' }], text: 'kursiv' },
        { type: 'text', text: ' und ' },
        {
          type: 'text',
          marks: [{ type: 'underline' }],
          text: 'unterstrichen',
        },
        { type: 'hardBreak' },
        { type: 'text', marks: [{ type: 'bold' }], text: 'vor' },
        { type: 'hardBreak', marks: [{ type: 'bold' }] },
        { type: 'text', marks: [{ type: 'bold' }], text: 'nach' },
      ],
    },
  ],
};

// Shared literal with backend test 2.2 (implementation/backend.md, Handovers); keep both copies identical.
const nonCanonicalFormattedContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          marks: [{ type: 'underline' }, { type: 'bold', attrs: { level: 1 } }],
          text: 'Fe',
        },
        {
          type: 'text',
          marks: [{ type: 'bold' }, { type: 'underline' }],
          text: 'tt',
        },
        { type: 'text', text: ' normal', extra: true },
      ],
    },
  ],
};

const expectedCanonicalFormattedContent: BeschlussContent = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          marks: [{ type: 'bold' }, { type: 'underline' }],
          text: 'Fett',
        },
        { type: 'text', text: ' normal' },
      ],
    },
  ],
};

const getSectionDocument = (editor: Editor, sectionIndex: number) => ({
  type: 'doc',
  content: [editor.state.doc.child(sectionIndex * 2 + 1).toJSON()],
});

// ProseMirror runs input rules only from handleTextInput, which insertText and insertContent skip.
const typeText = (editor: Editor, text: string) => {
  for (const character of text) {
    const { from, to } = editor.state.selection;
    const insertCharacter = () =>
      editor.state.tr.insertText(character, from, to);
    const handled = editor.view.someProp('handleTextInput', (handleTextInput) =>
      handleTextInput(editor.view, from, to, character, insertCharacter),
    );
    if (!handled) {
      editor.view.dispatch(insertCharacter());
    }
  }
};

describe('textToParagraphContent', () => {
  it('creates hard breaks inside one paragraph', () => {
    expect(textToParagraphContent('First\nSecond')).toEqual([
      { type: 'text', text: 'First' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Second' },
    ]);
  });

  it('returns undefined for empty text', () => {
    expect(textToParagraphContent('')).toBeUndefined();
  });

  it('normalizes Windows line endings to hard breaks', () => {
    expect(textToParagraphContent('First\r\nSecond\rThird')).toEqual([
      { type: 'text', text: 'First' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Second' },
      { type: 'hardBreak' },
      { type: 'text', text: 'Third' },
    ]);
  });
});

describe('buildStructureTemplate', () => {
  it('produces heading + paragraph items for each section', () => {
    const sections = [
      makeSection('a', 'A Tenor', 'First\nSecond'),
      makeSection('b', 'B Plan', 'Only one'),
    ];

    expect(buildStructureTemplate(sections)).toEqual([
      { type: 'heading', level: 3, text: 'A Tenor' },
      { type: 'paragraph' },
      { type: 'heading', level: 3, text: 'B Plan' },
      { type: 'paragraph' },
    ]);
  });
});

describe('buildEditorContent', () => {
  it('wraps each section in heading + paragraph nodes', () => {
    const sections = [
      makeSection('a', 'Title A', 'Content A'),
      makeSection('b', 'Title B', 'Content B'),
    ];

    expect(buildEditorContent(sections)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Title A' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Content A' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Title B' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Content B' }],
        },
      ],
    });
  });

  it('preserves special characters in titles', () => {
    const doc = buildEditorContent([
      makeSection('a', 'A & B <script>', 'safe'),
    ]);

    expect(doc.content?.[0]?.content?.[0]?.text).toBe('A & B <script>');
  });
});

describe('extractNodeTexts', () => {
  it('rebuilds plain text content for each outline node', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'A' }],
        },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'One' },
            { type: 'hardBreak' },
            { type: 'text', text: 'Two' },
          ],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'B' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Three' }],
        },
      ],
    };

    expect(extractNodeTexts(doc, ['node-a', 'node-b'])).toEqual({
      'node-a': 'One\nTwo',
      'node-b': 'Three',
    });
  });
});

describe('createStructureGuardExtension', () => {
  it('keeps Enter inside the same paragraph as a hard break', () => {
    const sections = [makeSection('node-a', 'A', 'Alpha')];
    const editor = new Editor({
      extensions: [
        beschlussStarterKit,
        TextareaEnterExtension,
        createStructureGuardExtension(() => buildStructureTemplate(sections)),
      ],
      content: buildEditorContent(sections),
    });

    const selectionPos = getFirstParagraphSelectionPos(
      editor.state.doc,
      'node-a',
      ['node-a'],
    );
    editor.commands.setTextSelection(selectionPos + 'Alpha'.length);

    expect(editor.commands.enter()).toBe(true);
    expect(editor.commands.insertContent('Beta')).toBe(true);
    expect(
      matchesStructureTemplate(
        editor.state.doc,
        buildStructureTemplate(sections),
      ),
    ).toBe(true);
    expect(extractNodeTexts(editor.getJSON(), ['node-a'])).toEqual({
      'node-a': 'Alpha\nBeta',
    });

    editor.destroy();
  });

  it('rejects text changes inside read-only outline sections', () => {
    const sections = [
      makeSection('node-a', 'A', 'Alpha'),
      makeSection('node-b', 'B', 'Beta'),
    ];
    const editor = new Editor({
      extensions: [
        beschlussStarterKit,
        createStructureGuardExtension(
          () => buildStructureTemplate(sections),
          () => ['node-a', 'node-b'],
          () => new Set(['node-a']),
        ),
      ],
      content: buildEditorContent(sections),
    });
    const nodeBParagraphStart = getFirstParagraphSelectionPos(
      editor.state.doc,
      'node-b',
      ['node-a', 'node-b'],
    );

    editor.commands.setTextSelection(nodeBParagraphStart + 'Beta'.length);

    expect(editor.commands.insertContent(' blocked')).toBe(true);
    expect(extractNodeTexts(editor.getJSON(), ['node-a', 'node-b'])).toEqual({
      'node-a': 'Alpha',
      'node-b': 'Beta',
    });

    editor.destroy();
  });
});

describe('formatted section content', () => {
  const createEditor = (sections: BeschlussSection[]) =>
    new Editor({
      extensions: createBeschlussEditorExtensions(() =>
        buildStructureTemplate(sections),
      ),
      content: buildEditorContent(sections),
    });

  it('builds a section from its formatted content, including marks on hard breaks', () => {
    const editor = createEditor([
      makeSection(
        'node-a',
        'A',
        'Fett und kursiv und unterstrichen\nvor\nnach',
        canonicalFormattedContent,
      ),
    ]);

    expect(getSectionDocument(editor, 0)).toEqual(canonicalFormattedContent);

    editor.destroy();
  });

  it('builds a section without formatted content from its plain text', () => {
    const editor = createEditor([makeSection('node-a', 'A', 'First\nSecond')]);

    expect(getSectionDocument(editor, 0)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'First' },
            { type: 'hardBreak' },
            { type: 'text', text: 'Second' },
          ],
        },
      ],
    });

    editor.destroy();
  });

  it('normalizes a non-canonical document to the canonical form the backend stores', () => {
    const beschlussEditorSchema = getSchema(
      createBeschlussEditorExtensions(() => []),
    );

    expect(
      ProseMirrorNode.fromJSON(
        beschlussEditorSchema,
        nonCanonicalFormattedContent,
      ).toJSON(),
    ).toEqual(expectedCanonicalFormattedContent);
  });
});

describe('structure guard formatting', () => {
  const sections = [
    makeSection('node-a', 'A', 'Alpha'),
    makeSection('node-b', 'B', 'Beta'),
  ];
  const outlineNodeIds = ['node-a', 'node-b'];
  const createGuardedEditor = () =>
    new Editor({
      extensions: createBeschlussEditorExtensions(
        () => buildStructureTemplate(sections),
        () => outlineNodeIds,
        () => new Set(['node-a']),
      ),
      content: buildEditorContent(sections),
    });

  it('rejects a bold toggle in a read-only section', () => {
    const editor = createGuardedEditor();
    const from = getFirstParagraphSelectionPos(
      editor.state.doc,
      'node-b',
      outlineNodeIds,
    );

    editor.commands.setTextSelection({ from, to: from + 'Beta'.length });
    editor.commands.toggleBold();

    expect(editor.state.doc.child(3).toJSON()).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Beta' }],
    });

    editor.destroy();
  });

  it('rejects a bold toggle on a heading', () => {
    const editor = createGuardedEditor();
    const headingTextStart = 1;

    editor.commands.setTextSelection({
      from: headingTextStart,
      to: headingTextStart + 'A'.length,
    });
    editor.commands.toggleBold();

    expect(editor.state.doc.child(0).toJSON()).toEqual({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'A' }],
    });

    editor.destroy();
  });
});

describe('unsupported marks', () => {
  const sections = [makeSection('node-a', 'A', 'Alpha')];
  const createEditor = () =>
    new Editor({
      extensions: createBeschlussEditorExtensions(() =>
        buildStructureTemplate(sections),
      ),
      content: buildEditorContent(sections),
    });

  it.each(['Mod-Shift-s', 'Mod-e'])(
    'does not apply a mark for the %s shortcut',
    (shortcut) => {
      const editor = createEditor();
      const from = getFirstParagraphSelectionPos(editor.state.doc, 'node-a', [
        'node-a',
      ]);

      editor.commands.setTextSelection({ from, to: from + 'Alpha'.length });
      editor.commands.keyboardShortcut(shortcut);

      expect(editor.state.doc.child(1).toJSON()).toEqual({
        type: 'paragraph',
        content: [{ type: 'text', text: 'Alpha' }],
      });

      editor.destroy();
    },
  );

  it.each(['~~struck~~', '`coded`'])(
    'does not apply a mark when typing %s',
    (input) => {
      const editor = createEditor();
      const from = getFirstParagraphSelectionPos(editor.state.doc, 'node-a', [
        'node-a',
      ]);

      editor.commands.setTextSelection(from + 'Alpha'.length);
      typeText(editor, ` ${input}`);

      expect(editor.state.doc.child(1).toJSON()).toEqual({
        type: 'paragraph',
        content: [{ type: 'text', text: `Alpha ${input}` }],
      });

      editor.destroy();
    },
  );
});

describe('PastePlainTextAsHardBreaksExtension', () => {
  it('pastes multiline external plain text inside the active paragraph', () => {
    const sections = [makeSection('node-a', 'A', 'Alpha')];
    const editor = new Editor({
      extensions: [
        beschlussStarterKit,
        createStructureGuardExtension(() => buildStructureTemplate(sections)),
        PastePlainTextAsHardBreaksExtension,
      ],
      content: buildEditorContent(sections),
    });
    const preventDefault = vi.fn();
    const pasteEvent = {
      clipboardData: {
        getData: (type: string) =>
          type === 'text/plain' ? 'Beta\r\nGamma' : '',
      },
      preventDefault,
    } as unknown as ClipboardEvent;
    const selectionPos = getFirstParagraphSelectionPos(
      editor.state.doc,
      'node-a',
      ['node-a'],
    );
    editor.commands.setTextSelection(selectionPos + 'Alpha'.length);

    const handled = editor.view.someProp('handlePaste', (handler) =>
      handler(editor.view, pasteEvent, null as never),
    );

    expect(handled).toBe(true);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(
      matchesStructureTemplate(
        editor.state.doc,
        buildStructureTemplate(sections),
      ),
    ).toBe(true);
    expect(extractNodeTexts(editor.getJSON(), ['node-a'])).toEqual({
      'node-a': 'AlphaBeta\nGamma',
    });

    editor.destroy();
  });

  it('lets single-line text use the default paste behavior', () => {
    const sections = [makeSection('node-a', 'A', 'Alpha')];
    const editor = new Editor({
      extensions: [
        StarterKit,
        createStructureGuardExtension(() => buildStructureTemplate(sections)),
        PastePlainTextAsHardBreaksExtension,
      ],
      content: buildEditorContent(sections),
    });
    const preventDefault = vi.fn();
    const pasteEvent = {
      clipboardData: {
        getData: (type: string) => (type === 'text/plain' ? 'Beta' : ''),
      },
      preventDefault,
    } as unknown as ClipboardEvent;

    const handled = editor.view.someProp('handlePaste', (handler) =>
      handler(editor.view, pasteEvent, null as never),
    );

    expect(handled).toBeUndefined();
    expect(preventDefault).not.toHaveBeenCalled();

    editor.destroy();
  });
});

describe('ParagraphSelectAllExtension', () => {
  it('selects only the active outline paragraph for Mod-a', () => {
    const sections = [
      makeSection('node-a', 'A', 'Alpha'),
      makeSection('node-b', 'B', 'Beta'),
    ];
    const editor = new Editor({
      extensions: [
        beschlussStarterKit,
        ParagraphSelectAllExtension,
        createStructureGuardExtension(() => buildStructureTemplate(sections)),
      ],
      content: buildEditorContent(sections),
    });
    const nodeBParagraphStart = getFirstParagraphSelectionPos(
      editor.state.doc,
      'node-b',
      ['node-a', 'node-b'],
    );

    editor.commands.setTextSelection(nodeBParagraphStart + 'Be'.length);

    const handled = editor.view.someProp('handleKeyDown', (handler) =>
      handler(
        editor.view,
        new KeyboardEvent('keydown', {
          ctrlKey: true,
          key: 'a',
        }),
      ),
    );

    expect(handled).toBe(true);
    expect(editor.state.selection.from).toBe(nodeBParagraphStart);
    expect(editor.state.selection.to).toBe(nodeBParagraphStart + 'Beta'.length);

    editor.destroy();
  });
});

describe('matchesStructureTemplate', () => {
  const template = [
    { type: 'heading' as const, level: 3, text: 'A' },
    { type: 'paragraph' as const },
  ];

  type TemplateChild = {
    type: { name: string };
    attrs?: { level: number };
    textContent?: string;
    nodeSize: number;
  };

  const makeTemplateDoc = (children: TemplateChild[]) =>
    ({
      childCount: children.length,
      child: (index: number) => children[index],
    }) as unknown as ProseMirrorNode;

  it('accepts a matching document', () => {
    const doc = makeTemplateDoc([
      {
        type: { name: 'heading' },
        attrs: { level: 3 },
        textContent: 'A',
        nodeSize: 5,
      },
      { type: { name: 'paragraph' }, nodeSize: 10 },
    ]);

    expect(matchesStructureTemplate(doc, template)).toBe(true);
  });

  it('rejects when child count differs', () => {
    const doc = makeTemplateDoc([
      {
        type: { name: 'heading' },
        attrs: { level: 3 },
        textContent: 'A',
        nodeSize: 5,
      },
    ]);

    expect(matchesStructureTemplate(doc, template)).toBe(false);
  });
});

type FlatNode = {
  type: { name: string };
  attrs?: { level: number };
  textContent?: string;
  nodeSize: number;
};

const makeDescendableDoc = (children: FlatNode[]) => {
  const positions: number[] = [];
  let offset = 1;

  for (const child of children) {
    positions.push(offset);
    offset += child.nodeSize;
  }

  return {
    childCount: children.length,
    child: (index: number) => children[index],
    descendants: (
      callback: (node: FlatNode, pos: number) => boolean | void,
    ) => {
      for (let i = 0; i < children.length; i += 1) {
        const child = children[i];
        const position = positions[i];
        if (!child || position === undefined) {
          continue;
        }

        const result = callback(child, position);
        if (result === false) {
          break;
        }
      }
    },
  } as unknown as ProseMirrorNode;
};

describe('getOutlineNodeIdAtPosition', () => {
  const outlineNodeIds = ['node-a', 'node-b'];

  const doc = makeDescendableDoc([
    {
      type: { name: 'heading' },
      attrs: { level: 3 },
      textContent: 'A',
      nodeSize: 5,
    },
    { type: { name: 'paragraph' }, nodeSize: 10 },
    {
      type: { name: 'heading' },
      attrs: { level: 3 },
      textContent: 'B',
      nodeSize: 5,
    },
    { type: { name: 'paragraph' }, nodeSize: 10 },
  ]);

  it('returns the first outline node when position is inside the first block', () => {
    expect(getOutlineNodeIdAtPosition(doc, 3, outlineNodeIds)).toBe('node-a');
  });

  it('returns the second outline node when position is past the second heading', () => {
    expect(getOutlineNodeIdAtPosition(doc, 20, outlineNodeIds)).toBe('node-b');
  });
});

describe('getFirstParagraphSelectionPos', () => {
  const outlineNodeIds = ['node-a', 'node-b'];

  const doc = makeDescendableDoc([
    {
      type: { name: 'heading' },
      attrs: { level: 3 },
      textContent: 'A',
      nodeSize: 5,
    },
    { type: { name: 'paragraph' }, nodeSize: 10 },
    {
      type: { name: 'heading' },
      attrs: { level: 3 },
      textContent: 'B',
      nodeSize: 5,
    },
    { type: { name: 'paragraph' }, nodeSize: 10 },
  ]);

  it('returns position inside the first paragraph of the matching block', () => {
    expect(
      getFirstParagraphSelectionPos(doc, 'node-a', outlineNodeIds),
    ).toBeGreaterThan(0);
  });

  it('returns -1 for an unknown outline node', () => {
    expect(getFirstParagraphSelectionPos(doc, 'unknown', outlineNodeIds)).toBe(
      -1,
    );
  });
});
