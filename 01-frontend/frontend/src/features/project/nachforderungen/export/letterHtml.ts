import type { Editor } from '@tiptap/react';

import type { RequestItem } from '@/features/project/nachforderungen/data/schemas/requestItem.schema';

export type LetterLabels = {
  reasonLabel: string;
};

/** Generate HTML for a single item section. */
export function generateItemSectionHtml(
  item: RequestItem,
  reasonLabel: string,
): string {
  return `<section data-item-id="${escapeHtml(item.id)}"><h2>${escapeHtml(item.title)}</h2><p><strong>${escapeHtml(reasonLabel)}</strong> ${escapeHtml(item.reason)}</p></section>`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const setsEqual = (a: Set<string>, b: Set<string>): boolean => {
  if (a.size !== b.size) {
    return false;
  }
  for (const item of a) {
    if (!b.has(item)) {
      return false;
    }
  }
  return true;
};

/**
 * Generate the full letter HTML (used only for initial load).
 * Items are rendered in the same order as the request list.
 */
export const generateLetterHtml = (
  items: ReadonlyArray<RequestItem>,
  labels: LetterLabels,
): string =>
  items
    .map((item) => generateItemSectionHtml(item, labels.reasonLabel))
    .join('');

/**
 * Remove item sections from the editor by their IDs.
 * Deletions are applied in a single ProseMirror transaction (reverse order).
 */
export const removeSections = (editor: Editor, ids: string[]): void => {
  const idsSet = new Set(ids);
  const { tr } = editor.state;
  const toDelete: { from: number; to: number }[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'itemSection') {
      const id = node.attrs.itemId;
      if (typeof id === 'string' && idsSet.has(id)) {
        toDelete.push({ from: pos, to: pos + node.nodeSize });
      }
      return false;
    }
  });

  toDelete.sort((a, b) => b.from - a.from);
  for (const { from, to } of toDelete) {
    tr.delete(from, to);
  }

  if (toDelete.length > 0) {
    editor.view.dispatch(tr);
  }
};

type SectionPosition = {
  start: number;
  end: number;
};

const findPrecedingSectionEnd = (
  itemIndex: number,
  allItems: ReadonlyArray<RequestItem>,
  sectionPositions: ReadonlyMap<string, SectionPosition>,
): number | undefined => {
  for (let i = itemIndex - 1; i >= 0; i--) {
    const sibling = allItems[i];
    if (!sibling) {
      continue;
    }

    const siblingPos = sectionPositions.get(sibling.id);
    if (siblingPos) {
      return siblingPos.end;
    }
  }

  return undefined;
};

const findFollowingSectionStart = (
  itemIndex: number,
  allItems: ReadonlyArray<RequestItem>,
  sectionPositions: ReadonlyMap<string, SectionPosition>,
): number | undefined => {
  for (let i = itemIndex + 1; i < allItems.length; i++) {
    const sibling = allItems[i];
    if (!sibling) {
      continue;
    }

    const siblingPos = sectionPositions.get(sibling.id);
    if (siblingPos) {
      return siblingPos.start;
    }
  }

  return undefined;
};

/**
 * Insert a new item section at the correct position in the editor.
 *
 * Uses the data order from `allItems` to determine where the section belongs
 * relative to sections already present in the editor.
 *
 * Position logic:
 * 1. Find the preceding item in data order that has a section -> insert after it.
 * 2. If no preceding sibling exists but a following section does -> insert before it.
 * 3. Fallback -> insert at the end.
 */
export const insertSection = (
  editor: Editor,
  item: RequestItem,
  allItems: ReadonlyArray<RequestItem>,
  labels: LetterLabels,
): void => {
  const sectionPositions = new Map<string, SectionPosition>();

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'itemSection') {
      const id = node.attrs.itemId;
      if (typeof id === 'string') {
        sectionPositions.set(id, { start: pos, end: pos + node.nodeSize });
      }
      return false;
    }
  });

  const itemIndex = allItems.findIndex((i) => i.id === item.id);
  const insertPos =
    findPrecedingSectionEnd(itemIndex, allItems, sectionPositions) ??
    findFollowingSectionStart(itemIndex, allItems, sectionPositions) ??
    editor.state.doc.content.size;

  editor
    .chain()
    .insertContentAt(
      insertPos,
      generateItemSectionHtml(item, labels.reasonLabel),
    )
    .run();
};

/**
 * Synchronize the editor content with the current set of included items.
 * Returns the updated set of included IDs for tracking.
 */
export const syncEditorContent = (
  editor: Editor,
  includedItems: RequestItem[],
  prevIds: Set<string>,
  isInitialized: boolean,
  labels: LetterLabels,
): { newIds: Set<string>; wasInitialized: boolean } => {
  const currentIds = new Set(includedItems.map((i) => i.id));

  if (!isInitialized) {
    editor.commands.setContent(generateLetterHtml(includedItems, labels));
    return { newIds: currentIds, wasInitialized: true };
  }

  if (setsEqual(currentIds, prevIds)) {
    return { newIds: currentIds, wasInitialized: true };
  }

  const added = [...currentIds].filter((id) => !prevIds.has(id));
  const removed = [...prevIds].filter((id) => !currentIds.has(id));

  if (removed.length > 0) {
    removeSections(editor, removed);
  }

  if (added.length > 0) {
    const addedItems = added
      .map((id) => includedItems.find((item) => item.id === id))
      .filter((item): item is RequestItem => item !== undefined);

    for (const item of addedItems) {
      insertSection(editor, item, includedItems, labels);
    }
  }

  return { newIds: currentIds, wasInitialized: true };
};
