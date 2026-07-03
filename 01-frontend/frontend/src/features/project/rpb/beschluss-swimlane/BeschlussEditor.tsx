import type { Editor, JSONContent } from '@tiptap/core';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useTranslation } from 'react-i18next';
import { BeschlussEditorLayout } from './BeschlussEditorLayout';
import {
  areBeschlussEditorPropsEqual,
  type BeschlussEditorProps,
} from './beschlussEditorProps';
import {
  createStructureGuardExtension,
  extractNodeText,
  getOutlineNodeIdAtPosition,
  PastePlainTextAsHardBreaksExtension,
  ParagraphSelectAllExtension,
  TextareaEnterExtension,
  type StructureItem,
} from './beschlussEditorExtensions';
import { buildBeschlussEditorState } from './beschlussEditorState';
import { ParagraphFocusExtension } from './beschlussParagraphFocusExtension';
import { useBeschlussEditorExternalSelectionSync } from './useBeschlussEditorExternalSelectionSync';

const H3_SELECTOR = '[&_h3';

const EDITOR_CLASS = [
  'focus-ring min-h-full bg-white p-4 text-[13px] leading-[18px] tracking-[-0.01em] text-text-secondary focus:outline-none [&>*+*]:mt-2',
  `${H3_SELECTOR}]:cursor-default ${H3_SELECTOR}]:rounded-lg ${H3_SELECTOR}]:px-2 ${H3_SELECTOR}]:py-[5px] ${H3_SELECTOR}]:text-base ${H3_SELECTOR}]:font-medium ${H3_SELECTOR}]:leading-[22px] ${H3_SELECTOR}]:tracking-[-0.01em] ${H3_SELECTOR}]:text-brand-950`,
].join(' ');

/**
 * Renders one structured TipTap document for the full live VAE outline and
 * keeps URL selection, editor focus, and per-node text commits aligned.
 */
const BeschlussEditorComponent = (props: BeschlussEditorProps) => {
  const {
    canExport,
    headerAccessory,
    onExportClick,
    onTextBlur,
    onVaeNodeSelect,
    sections,
    selectedVaeNodeId,
  } = props;

  const { t } = useTranslation('Rpb');
  const editorContentId = useId();

  // eslint-disable-next-line no-restricted-syntax -- TipTap content generation and JSON stringification are expensive enough to pin to section payload changes.
  const editorContentState = useMemo(
    () => buildBeschlussEditorState(sections),
    [sections],
  );
  const {
    content,
    contentJson,
    outlineNodeIds,
    outlineNodeIdsKey,
    persistedTextByOutlineNodeId,
    sectionByOutlineNodeId,
    structureTemplate,
  } = editorContentState;
  // eslint-disable-next-line no-restricted-syntax -- TipTap extensions are intentionally stable and read this derived editability set through a ref.
  const editableOutlineNodeIds = useMemo(
    () =>
      new Set(
        sections
          .filter((section) => section.isEditable)
          .map((section) => section.vaeNodeId),
      ),
    [sections],
  );
  const structureTemplateRef =
    useRef<ReadonlyArray<StructureItem>>(structureTemplate);
  const editableOutlineNodeIdsRef = useRef<ReadonlySet<string>>(
    editableOutlineNodeIds,
  );
  const onVaeNodeSelectRef = useRef(onVaeNodeSelect);
  const onTextBlurRef = useRef(onTextBlur);
  const lastExternalContentJsonRef = useRef(contentJson);
  const pendingExternalContentRef = useRef<JSONContent | null>(null);
  const activeOutlineNodeIdRef = useRef<string | null>(null);
  const outlineNodeIdsRef = useRef(outlineNodeIds);
  const sectionByOutlineNodeIdRef = useRef(sectionByOutlineNodeId);
  const persistedTextByOutlineNodeIdRef = useRef(persistedTextByOutlineNodeId);

  useLayoutEffect(() => {
    onVaeNodeSelectRef.current = onVaeNodeSelect;
    onTextBlurRef.current = onTextBlur;
    editableOutlineNodeIdsRef.current = editableOutlineNodeIds;
    outlineNodeIdsRef.current = outlineNodeIds;
    structureTemplateRef.current = structureTemplate;
    sectionByOutlineNodeIdRef.current = sectionByOutlineNodeId;
    persistedTextByOutlineNodeIdRef.current = persistedTextByOutlineNodeId;
  }, [
    editableOutlineNodeIds,
    onTextBlur,
    onVaeNodeSelect,
    outlineNodeIds,
    persistedTextByOutlineNodeId,
    sectionByOutlineNodeId,
    structureTemplate,
  ]);

  // eslint-disable-next-line no-restricted-syntax -- TipTap extensions must be stable across renders; the structure guard reads the current template via ref.
  const extensions = useMemo(
    () => [
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
        () => structureTemplate,
        () => outlineNodeIds,
        () => editableOutlineNodeIds,
      ),
      ParagraphFocusExtension,
      ParagraphSelectAllExtension,
      TextareaEnterExtension,
      // Multi-line external paste must stay textarea-like so the structure guard does not reject new paragraph nodes.
      PastePlainTextAsHardBreaksExtension,
    ],
    [editableOutlineNodeIds, outlineNodeIds, structureTemplate],
  );

  // eslint-disable-next-line no-restricted-syntax -- TipTap event handlers need a stable commit command that reads the latest editor ownership refs.
  const commitOutlineNodeText = useCallback(
    (
      doc: Parameters<typeof extractNodeText>[0],
      outlineNodeId: string | null,
    ) => {
      if (!outlineNodeId) {
        return;
      }

      const section = sectionByOutlineNodeIdRef.current.get(outlineNodeId);
      if (!section?.isEditable) {
        return;
      }

      const nextText = extractNodeText(
        doc,
        outlineNodeId,
        outlineNodeIdsRef.current,
      );
      const persistedText =
        persistedTextByOutlineNodeIdRef.current.get(outlineNodeId) ?? '';

      if (nextText === undefined || nextText === persistedText) {
        return;
      }

      persistedTextByOutlineNodeIdRef.current.set(outlineNodeId, nextText);
      onTextBlurRef.current(section.vaeNodeId, nextText);
    },
    [],
  );

  // eslint-disable-next-line no-restricted-syntax -- TipTap callbacks and the external-selection effect share one stable active-node transition command.
  const setActiveOutlineNodeId = useCallback(
    (
      doc: Parameters<typeof extractNodeText>[0],
      nextOutlineNodeId: string | null,
      shouldSyncUrl: boolean,
    ) => {
      if (!nextOutlineNodeId) {
        activeOutlineNodeIdRef.current = null;
        return;
      }

      if (activeOutlineNodeIdRef.current === nextOutlineNodeId) {
        return;
      }

      // Commit the previous paragraph before changing selection so edits are not
      // lost while users navigate between outline nodes.
      commitOutlineNodeText(doc, activeOutlineNodeIdRef.current);
      activeOutlineNodeIdRef.current = nextOutlineNodeId;
      if (shouldSyncUrl) {
        onVaeNodeSelectRef.current(nextOutlineNodeId);
      }
    },
    [commitOutlineNodeText],
  );

  // eslint-disable-next-line no-restricted-syntax -- the external-selection effect needs a stable command for TipTap's imperative state sync.
  const setExternalActiveOutlineNodeId = useCallback(
    (doc: Parameters<typeof extractNodeText>[0], nextOutlineNodeId: string) => {
      setActiveOutlineNodeId(doc, nextOutlineNodeId, false);
    },
    [setActiveOutlineNodeId],
  );

  const setActiveOutlineNodeIdAtPosition = (
    doc: Parameters<typeof getOutlineNodeIdAtPosition>[0],
    position: number,
    shouldSyncUrl: boolean,
  ) => {
    setActiveOutlineNodeId(
      doc,
      getOutlineNodeIdAtPosition(doc, position, outlineNodeIdsRef.current),
      shouldSyncUrl,
    );
  };

  const editor = useEditor({
    extensions,
    content,
    editorProps: {
      attributes: {
        class: EDITOR_CLASS,
        role: 'textbox',
        'aria-label': t('beschluss.editorAriaLabel'),
        'aria-multiline': 'true',
        tabindex: '0',
      },
      handleClick: (view, position) => {
        setActiveOutlineNodeIdAtPosition(view.state.doc, position, true);
        return false;
      },
      handleDOMEvents: {
        focus: (view) => {
          requestAnimationFrame(() => {
            if (
              view.dom.ownerDocument.activeElement !== view.dom ||
              !view.dom.matches(':focus-visible')
            ) {
              return;
            }

            view.focus();
          });
          return false;
        },
      },
    },
    onSelectionUpdate: ({ editor: editorInstance }) => {
      if (!editorInstance.state.selection.empty) {
        return;
      }

      setActiveOutlineNodeIdAtPosition(
        editorInstance.state.doc,
        editorInstance.state.selection.from,
        true,
      );
    },
    onBlur: ({ editor: editorInstance }) => {
      commitOutlineNodeText(
        editorInstance.state.doc,
        activeOutlineNodeIdRef.current,
      );

      const pendingContent = pendingExternalContentRef.current;
      if (pendingContent) {
        const pendingJson = JSON.stringify(pendingContent);
        const currentEditorJson = JSON.stringify(editorInstance.getJSON());
        if (currentEditorJson !== pendingJson) {
          editorInstance.commands.setContent(pendingContent, {
            emitUpdate: false,
          });
        }
        lastExternalContentJsonRef.current = pendingJson;
        pendingExternalContentRef.current = null;
      }
    },
  }) as Editor | null;

  // eslint-disable-next-line no-restricted-syntax -- TipTap exposes imperative content APIs; syncs external content changes into the editor.
  useEffect(() => {
    if (!editor) {
      return;
    }

    if (contentJson === lastExternalContentJsonRef.current) {
      return;
    }
    if (editor.isFocused) {
      pendingExternalContentRef.current = content;
      return;
    }
    if (JSON.stringify(editor.getJSON()) !== contentJson) {
      editor.commands.setContent(content, { emitUpdate: false });
    }
    lastExternalContentJsonRef.current = contentJson;
    pendingExternalContentRef.current = null;
  }, [content, contentJson, editor]);

  useBeschlussEditorExternalSelectionSync({
    editor,
    outlineNodeIdsKey,
    outlineNodeIdsRef,
    selectedVaeNodeId,
    setExternalActiveOutlineNodeId,
  });

  return (
    <BeschlussEditorLayout
      canExport={canExport}
      editor={editor}
      editorContentId={editorContentId}
      headerAccessory={headerAccessory}
      onExportClick={onExportClick}
      t={t}
    />
  );
};

BeschlussEditorComponent.displayName = 'BeschlussEditor';

export const BeschlussEditor = memo(
  BeschlussEditorComponent,
  areBeschlussEditorPropsEqual,
);
