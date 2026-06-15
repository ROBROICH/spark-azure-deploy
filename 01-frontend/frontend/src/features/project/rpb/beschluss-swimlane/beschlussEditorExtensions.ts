import { invariant } from 'es-toolkit/util';
import { Extension, type JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import type { BeschlussSection } from '../rpbBeschluss.types';
import { ParagraphFocusExtension } from './beschlussParagraphFocusExtension';
import {
  extractNodeText,
  extractTextFromNode,
  extractTextFromProseMirrorNode,
  isMultilineText,
  textToParagraphContent,
} from './beschlussEditorText';

type StructureItem =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph' };

const structureGuardPluginKey = new PluginKey('beschlussStructureGuard');

const TextareaEnterExtension = Extension.create({
  name: 'beschlussTextareaEnter',

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.setHardBreak(),
    };
  },
});

const ParagraphSelectAllExtension = Extension.create({
  name: 'beschlussParagraphSelectAll',
  priority: 10000,

  addKeyboardShortcuts() {
    return {
      'Mod-a': () => {
        const { state, view } = this.editor;
        const { $from } = state.selection;
        const paragraphDepth = Array.from(
          { length: $from.depth + 1 },
          (_, index) => $from.depth - index,
        ).find((depth) => $from.node(depth).type.name === 'paragraph');

        if (paragraphDepth === undefined) {
          return false;
        }

        const from = $from.start(paragraphDepth);
        const to = $from.end(paragraphDepth);
        view.dispatch(
          state.tr.setSelection(TextSelection.create(state.doc, from, to)),
        );

        return true;
      },
    };
  },
});

/**
 * Verifies the immutable top-level editor skeleton so generated headings stay fixed
 * and users can only edit paragraph content inside the expected block layout.
 */
const matchesStructureTemplate = (
  doc: ProseMirrorNode,
  template: ReadonlyArray<StructureItem>,
) => {
  if (doc.childCount !== template.length) {
    return false;
  }

  for (let index = 0; index < template.length; index += 1) {
    const expected = template[index];
    invariant(expected !== undefined, 'Expected structure item');
    const node = doc.child(index);

    if (node.type.name !== expected.type) {
      return false;
    }
    if (expected.type !== 'heading') {
      continue;
    }
    if (node.attrs.level !== expected.level) {
      return false;
    }
    if (node.textContent !== expected.text) {
      return false;
    }
  }

  return true;
};

/**
 * Guards the Beschluss editor's generated heading/paragraph skeleton and,
 * when provided, blocks paragraph text mutations for read-only outline nodes.
 */
const createStructureGuardExtension = (
  getTemplate: () => ReadonlyArray<StructureItem>,
  getOutlineNodeIds?: () => string[],
  getEditableOutlineNodeIds?: () => ReadonlySet<string>,
) =>
  Extension.create({
    name: 'beschlussStructureGuard',

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: structureGuardPluginKey,
          filterTransaction: (transaction) => {
            if (!transaction.docChanged) {
              return true;
            }
            if (!matchesStructureTemplate(transaction.doc, getTemplate())) {
              return false;
            }

            const outlineNodeIds = getOutlineNodeIds?.();
            const editableOutlineNodeIds = getEditableOutlineNodeIds?.();
            if (!outlineNodeIds || !editableOutlineNodeIds) {
              return true;
            }

            return outlineNodeIds.every((outlineNodeId, index) => {
              if (editableOutlineNodeIds.has(outlineNodeId)) {
                return true;
              }

              const paragraphIndex = index * 2 + 1;
              const beforeParagraph = transaction.before.child(paragraphIndex);
              const nextParagraph = transaction.doc.child(paragraphIndex);

              return (
                extractTextFromProseMirrorNode(beforeParagraph) ===
                extractTextFromProseMirrorNode(nextParagraph)
              );
            });
          },
        }),
      ];
    },
  });

// Browser and document clipboard content can paste paragraphs as multiple ProseMirror paragraph nodes.
// This editor allows only one paragraph per outline item, so convert external multi-line plaintext
// into hard breaks before ProseMirror creates a transaction the structure guard would reject.
const PastePlainTextAsHardBreaksExtension = Extension.create({
  name: 'beschlussPastePlainTextAsHardBreaks',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handlePaste: (_view, event) => {
            const plainText = event.clipboardData?.getData('text/plain');
            if (!plainText || !isMultilineText(plainText)) {
              return false;
            }

            event.preventDefault();
            return this.editor.commands.insertContent(
              textToParagraphContent(plainText) ?? [],
            );
          },
        },
      }),
    ];
  },
});

const buildStructureTemplate = (
  sections: BeschlussSection[],
): StructureItem[] => {
  return sections.flatMap((section) => [
    { type: 'heading' as const, level: 3, text: section.title },
    { type: 'paragraph' as const },
  ]);
};

const buildEditorContent = (sections: BeschlussSection[]): JSONContent => {
  const content: JSONContent[] = sections.flatMap((section) => [
    {
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: section.title }],
    },
    {
      type: 'paragraph',
      content: textToParagraphContent(section.text),
    },
  ]);

  return { type: 'doc', content };
};

const getOutlineNodeIdAtPosition = (
  doc: ProseMirrorNode,
  position: number,
  outlineNodeIds: string[],
): string | null => {
  let headingIndex = -1;
  let seenHeadings = 0;

  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') {
      return true;
    }

    if (pos > position) {
      return false;
    }

    headingIndex = seenHeadings;
    seenHeadings += 1;
    return true;
  });

  if (headingIndex < 0) {
    return null;
  }
  return outlineNodeIds[headingIndex] ?? null;
};

const getFirstParagraphSelectionPos = (
  doc: ProseMirrorNode,
  outlineNodeId: string,
  outlineNodeIds: string[],
) => {
  const targetHeadingIndex = outlineNodeIds.indexOf(outlineNodeId);
  if (targetHeadingIndex < 0) {
    return -1;
  }

  let seenHeadingCount = 0;
  let paragraphSelectionPos = -1;
  let found = false;

  doc.descendants((node, pos) => {
    if (found) {
      return false;
    }

    if (node.type.name === 'heading') {
      seenHeadingCount += 1;
      return true;
    }

    if (node.type.name !== 'paragraph') {
      return true;
    }
    if (seenHeadingCount - 1 !== targetHeadingIndex) {
      return true;
    }
    if (node.nodeSize < 2) {
      return true;
    }

    paragraphSelectionPos = pos + 1;
    found = true;
    return false;
  });

  return paragraphSelectionPos;
};

const extractNodeTexts = (doc: JSONContent, outlineNodeIds: string[]) => {
  const result: Partial<Record<string, string>> = {};
  const content = doc.content ?? [];
  let activeBlockIndex = -1;
  let blockNodes: JSONContent[] = [];

  const flush = () => {
    if (activeBlockIndex < 0) {
      return;
    }

    const outlineNodeId = outlineNodeIds[activeBlockIndex];
    if (!outlineNodeId) {
      return;
    }

    result[outlineNodeId] = blockNodes.map(extractTextFromNode).join('\n');
  };

  for (const node of content) {
    if (node.type === 'heading') {
      flush();
      activeBlockIndex += 1;
      blockNodes = [];
      continue;
    }

    if (activeBlockIndex >= 0) {
      blockNodes.push(node);
    }
  }

  flush();
  return result;
};

export {
  buildEditorContent,
  buildStructureTemplate,
  createStructureGuardExtension,
  extractNodeText,
  extractNodeTexts,
  getFirstParagraphSelectionPos,
  getOutlineNodeIdAtPosition,
  matchesStructureTemplate,
  PastePlainTextAsHardBreaksExtension,
  ParagraphFocusExtension,
  ParagraphSelectAllExtension,
  TextareaEnterExtension,
  textToParagraphContent,
};

export type { StructureItem };
