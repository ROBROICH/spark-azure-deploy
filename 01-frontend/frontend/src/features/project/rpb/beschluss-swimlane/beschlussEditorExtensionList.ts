import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import {
  createStructureGuardExtension,
  PastePlainTextAsHardBreaksExtension,
  ParagraphSelectAllExtension,
  TextareaEnterExtension,
  type StructureItem,
} from './beschlussEditorExtensions';
import { ParagraphFocusExtension } from './beschlussParagraphFocusExtension';

const beschlussStarterKit = StarterKit.configure({
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
  // The Beschluss content schema persists only bold, italic, and underline.
  strike: false,
  code: false,
});

const createBeschlussEditorExtensions = (
  getTemplate: () => ReadonlyArray<StructureItem>,
  getOutlineNodeIds?: () => string[],
  getEditableOutlineNodeIds?: () => ReadonlySet<string>,
) => [
  beschlussStarterKit,
  createStructureGuardExtension(
    getTemplate,
    getOutlineNodeIds,
    getEditableOutlineNodeIds,
  ),
  ParagraphFocusExtension,
  ParagraphSelectAllExtension,
  TextareaEnterExtension,
  // Multi-line external paste must stay textarea-like so the structure guard does not reject new paragraph nodes.
  PastePlainTextAsHardBreaksExtension,
];

const beschlussEditorSchema = getSchema(
  createBeschlussEditorExtensions(() => []),
);

export {
  beschlussEditorSchema,
  beschlussStarterKit,
  createBeschlussEditorExtensions,
};
