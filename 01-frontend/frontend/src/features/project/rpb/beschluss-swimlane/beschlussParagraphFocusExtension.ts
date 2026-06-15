import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

const paragraphFocusPluginKey = new PluginKey('beschlussParagraphFocus');

const PARAGRAPH_BASE_CLASS =
  'rounded-lg px-2 py-[7px] text-text-secondary transition-all';
const PARAGRAPH_FOCUSED_CLASS =
  'rounded-lg px-2 py-[7px] transition-all bg-slate-50 font-medium text-brand-navy selected-ring';

export const ParagraphFocusExtension = Extension.create({
  name: 'beschlussParagraphFocus',

  // eslint-disable-next-line custom-jsdoc/require-jsdoc-complexity -- ProseMirror decoration wiring is structurally complex but self-contained.
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: paragraphFocusPluginKey,
        props: {
          // eslint-disable-next-line custom-jsdoc/require-jsdoc-complexity -- Decoration mapping for heading/paragraph focus classes is intentionally centralized for editor rendering consistency.
          decorations: (state) => {
            const decorations: Decoration[] = [];
            const { $from } = state.selection;
            let focusedParagraphPos = -1;
            let activeHeadingPos = -1;

            for (let depth = $from.depth; depth > 0; depth -= 1) {
              const node = $from.node(depth);
              if (node.type.name !== 'paragraph') {
                continue;
              }
              focusedParagraphPos = $from.before(depth);
              break;
            }

            const headingEntries: { pos: number; nodeSize: number }[] = [];

            state.doc.descendants((node, pos) => {
              if (node.type.name === 'heading') {
                if (pos <= state.selection.from) {
                  activeHeadingPos = pos;
                }
                headingEntries.push({ pos, nodeSize: node.nodeSize });
                return true;
              }

              if (node.type.name !== 'paragraph') {
                return true;
              }

              const isFocused = pos === focusedParagraphPos;
              decorations.push(
                Decoration.node(pos, pos + node.nodeSize, {
                  class: isFocused
                    ? `rpb-outline-paragraph rpb-outline-paragraph-focused ${PARAGRAPH_FOCUSED_CLASS}`
                    : `rpb-outline-paragraph ${PARAGRAPH_BASE_CLASS}`,
                }),
              );

              return false;
            });

            for (const entry of headingEntries) {
              decorations.push(
                Decoration.node(entry.pos, entry.pos + entry.nodeSize, {
                  class:
                    entry.pos === activeHeadingPos
                      ? 'rpb-outline-heading-active'
                      : 'rpb-outline-heading-inactive',
                }),
              );
            }

            if (decorations.length === 0) {
              return null;
            }
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
