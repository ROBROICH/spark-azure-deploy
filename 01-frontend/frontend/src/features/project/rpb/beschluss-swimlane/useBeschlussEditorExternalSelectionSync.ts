import type { Editor } from '@tiptap/core';
import { useEffect } from 'react';
import { getFirstParagraphSelectionPos } from './beschlussEditorExtensions';

type ProseMirrorDoc = Parameters<typeof getFirstParagraphSelectionPos>[0];

type CurrentValueRef<T> = { current: T };

type UseBeschlussEditorExternalSelectionSyncParams = {
  editor: Editor | null;
  outlineNodeIdsKey: string;
  outlineNodeIdsRef: CurrentValueRef<string[]>;
  selectedVaeNodeId: string;
  setExternalActiveOutlineNodeId: (
    doc: ProseMirrorDoc,
    nextOutlineNodeId: string,
  ) => void;
};

export const useBeschlussEditorExternalSelectionSync = (
  params: UseBeschlussEditorExternalSelectionSyncParams,
) => {
  const {
    editor,
    outlineNodeIdsKey,
    outlineNodeIdsRef,
    selectedVaeNodeId,
    setExternalActiveOutlineNodeId,
  } = params;

  // eslint-disable-next-line no-restricted-syntax -- TipTap focus and scroll orchestration requires imperative editor/view DOM access when the selected VAE node changes externally
  useEffect(() => {
    if (!editor || editor.isDestroyed || !selectedVaeNodeId) {
      return;
    }

    const selectionPos = getFirstParagraphSelectionPos(
      editor.state.doc,
      selectedVaeNodeId,
      outlineNodeIdsRef.current,
    );
    if (selectionPos < 1) {
      return;
    }

    setExternalActiveOutlineNodeId(editor.state.doc, selectedVaeNodeId);
    editor.chain().setTextSelection(selectionPos).scrollIntoView().run();

    requestAnimationFrame(() => {
      if (editor.isDestroyed) {
        return;
      }

      const scrollContainer = editor.view.dom.parentElement;
      const focusedParagraph = editor.view.dom.querySelector<HTMLElement>(
        'p.rpb-outline-paragraph-focused',
      );
      if (!scrollContainer || !focusedParagraph) {
        return;
      }

      const containerRect = scrollContainer.getBoundingClientRect();
      const paragraphRect = focusedParagraph.getBoundingClientRect();
      const topOffsetTarget = scrollContainer.clientHeight * 0.28;
      const delta = paragraphRect.top - containerRect.top - topOffsetTarget;

      scrollContainer.scrollTo({ top: scrollContainer.scrollTop + delta });
    });
  }, [
    editor,
    outlineNodeIdsKey,
    outlineNodeIdsRef,
    selectedVaeNodeId,
    setExternalActiveOutlineNodeId,
  ]);
};
