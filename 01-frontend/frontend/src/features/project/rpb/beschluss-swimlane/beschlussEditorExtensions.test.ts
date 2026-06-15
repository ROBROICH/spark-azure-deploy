import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { describe, expect, it, vi } from 'vitest';
import type { BeschlussSection } from '../rpbBeschluss.types';
import {
  buildEditorContent,
  buildStructureTemplate,
  createStructureGuardExtension,
  extractNodeText,
  extractNodeTexts,
  getFirstParagraphSelectionPos,
  getOutlineNodeIdAtPosition,
  matchesStructureTemplate,
  PastePlainTextAsHardBreaksExtension,
  ParagraphSelectAllExtension,
  TextareaEnterExtension,
  textToParagraphContent,
} from './beschlussEditorExtensions';

const makeSection = (
  outlineNodeId: string,
  title: string,
  text: string,
): BeschlussSection => ({
  depth: 0,
  index: 0,
  isEditable: true,
  order: 0,
  parentVaeNodeId: null,
  text,
  title,
  vaeNodeId: outlineNodeId,
});

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

describe('extractNodeText', () => {
  it('rebuilds plain text only for the requested outline node', () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: buildEditorContent([
        makeSection('node-a', 'A', 'One\nTwo'),
        makeSection('node-b', 'B', 'Three'),
      ]),
    });

    expect(
      extractNodeText(editor.state.doc, 'node-a', ['node-a', 'node-b']),
    ).toBe('One\nTwo');
    expect(
      extractNodeText(editor.state.doc, 'node-b', ['node-a', 'node-b']),
    ).toBe('Three');

    editor.destroy();
  });
});

describe('createStructureGuardExtension', () => {
  it('keeps Enter inside the same paragraph as a hard break', () => {
    const sections = [makeSection('node-a', 'A', 'Alpha')];
    const editor = new Editor({
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [3],
            HTMLAttributes: {
              contenteditable: 'false',
              'data-readonly-heading': 'true',
            },
          },
          bulletList: false,
          orderedList: false,
          listItem: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          link: false,
        }),
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
        StarterKit.configure({
          heading: {
            levels: [3],
            HTMLAttributes: {
              contenteditable: 'false',
              'data-readonly-heading': 'true',
            },
          },
          bulletList: false,
          orderedList: false,
          listItem: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          link: false,
        }),
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

describe('PastePlainTextAsHardBreaksExtension', () => {
  it('pastes multiline external plain text inside the active paragraph', () => {
    const sections = [makeSection('node-a', 'A', 'Alpha')];
    const editor = new Editor({
      extensions: [
        StarterKit.configure({
          heading: {
            levels: [3],
            HTMLAttributes: {
              contenteditable: 'false',
              'data-readonly-heading': 'true',
            },
          },
          bulletList: false,
          orderedList: false,
          listItem: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          link: false,
        }),
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
        StarterKit.configure({
          heading: {
            levels: [3],
            HTMLAttributes: {
              contenteditable: 'false',
              'data-readonly-heading': 'true',
            },
          },
          bulletList: false,
          orderedList: false,
          listItem: false,
          blockquote: false,
          codeBlock: false,
          horizontalRule: false,
          link: false,
        }),
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
