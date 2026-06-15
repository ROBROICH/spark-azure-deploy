import { Node } from '@tiptap/react';

/**
 * Custom TipTap node: wraps each request item's content so we can
 * surgically add/remove items without resetting the entire editor.
 * Renders as <section data-item-id="...">
 */
export const ItemSection = Node.create({
  name: 'itemSection',
  group: 'block',
  content: 'block+',

  // eslint-disable-next-line custom-jsdoc/require-jsdoc-complexity -- TipTap extension API
  addAttributes() {
    return {
      itemId: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute('data-item-id'),
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.itemId) {
            return {};
          }
          return { 'data-item-id': attributes.itemId };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-item-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['section', HTMLAttributes, 0];
  },
});
