import { Button } from '@/features/ui/button/Button';
import { SwimlaneHeaderPortal } from '@/features/ui/swimlanes/SwimlaneHeaderPortal';
import { formatDate } from '@/i18n/formatDate';
import { eq, useLiveQuery } from '@tanstack/react-db';
import { getRouteApi } from '@tanstack/react-router';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { LucideIcon } from 'lucide-react';
import {
  Bold,
  Download,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Type,
  UnderlineIcon,
} from 'lucide-react';
import type { MouseEvent } from 'react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { requestItemsCollection } from '@/features/project/nachforderungen/data/collections/requestItems.collection';
import { sortByCreatedAtAsc } from '../data/requestItemPresentation';
import type { RequestItem } from '@/features/project/nachforderungen/data/schemas/requestItem.schema';
import { exportPdf } from '../export/exportPdf';
import { exportDocx } from '../export/exportDocx';
import { ItemSection } from '../export/itemSectionExtension';
import { syncEditorContent, type LetterLabels } from '../export/letterHtml';

const sessionDate = new Date().toISOString();

const route = getRouteApi('/verfahren/$verfahrenId/nachforderungen/');

type ToolbarItem =
  | {
      kind: 'button';
      icon: LucideIcon;
      labelKey: string;
      action: () => void;
      isActive: boolean;
    }
  | { kind: 'separator' };

/**
 * TipTap-based rich text editor for the Nachforderungsschreiben.
 *
 * State persistence strategy:
 * - On first load, the full letter HTML is set via `setContent`.
 * - After that, toggling items on/off only adds/removes the affected
 *   `<section>` nodes. Manual edits to other items are preserved.
 * - Re-adding an item after removing it inserts fresh content for that item.
 */
export const SupplementaryRequestLetter = () => {
  const { t, i18n } = useTranslation('SupplementaryRequests');
  const { verfahrenId } = route.useParams();
  const { data: requestItemsData } = useLiveQuery((q) =>
    q
      .from({ items: requestItemsCollection })
      .where(({ items }) => eq(items.projectId, verfahrenId)),
  );
  const queriedItems = [...requestItemsData].sort(sortByCreatedAtAsc);
  const requestItems: ReadonlyArray<RequestItem> = queriedItems;

  const includedItems: RequestItem[] = requestItems.filter(
    (item) => item.includedInLetter === true,
  );
  const initializedRef = useRef(false);
  const prevIncludedIdsRef = useRef<Set<string>>(new Set());
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: { keepMarks: true },
        orderedList: { keepMarks: true },
      }),
      ItemSection,
    ],
    immediatelyRender: false,
    editorProps: {
      attributes: {
        // Label and focus ring live on the real editable region (ProseMirror
        // node) rather than the EditorContent wrapper.
        'aria-label': t('SupplementaryRequestLetter.title'),
        class:
          'focus-ring min-h-full text-neutral-600 [&_h1]:mb-4 [&_h1]:text-[18px] [&_h1]:font-medium [&_h1]:text-brand-950 [&_h2]:mb-2 [&_h2]:mt-4 [&_h2]:text-base [&_h2]:font-medium [&_h2]:text-brand-950 [&_h3]:mb-2 [&_h3]:mt-3 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:text-brand-950 [&_p]:mb-2 [&_p]:leading-relaxed [&_ul]:mb-2 [&_ul]:ml-6 [&_ul]:list-disc [&_ol]:mb-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_li]:mb-1',
      },
    },
  });

  const editorState = useEditorState({
    editor,
    selector:
      /** Derives active formatting state from the TipTap editor instance. */
      ({ editor: e }) => ({
        isHeading1: e?.isActive('heading', { level: 1 }) ?? false,
        isHeading2: e?.isActive('heading', { level: 2 }) ?? false,
        isHeading3: e?.isActive('heading', { level: 3 }) ?? false,
        isParagraph:
          (e?.isActive('paragraph') ?? false) &&
          !(e?.isActive('heading') ?? false),
        isBold: e?.isActive('bold') ?? false,
        isItalic: e?.isActive('italic') ?? false,
        isUnderline: e?.isActive('underline') ?? false,
        isBulletList: e?.isActive('bulletList') ?? false,
        isOrderedList: e?.isActive('orderedList') ?? false,
      }),
  });

  const toolbarItems: ToolbarItem[] = [
    {
      kind: 'button',
      icon: Heading1,
      labelKey: 'heading1',
      action: () => editor?.chain().toggleHeading({ level: 1 }).run(),
      isActive: editorState?.isHeading1 ?? false,
    },
    {
      kind: 'button',
      icon: Heading2,
      labelKey: 'heading2',
      action: () => editor?.chain().toggleHeading({ level: 2 }).run(),
      isActive: editorState?.isHeading2 ?? false,
    },
    {
      kind: 'button',
      icon: Heading3,
      labelKey: 'heading3',
      action: () => editor?.chain().toggleHeading({ level: 3 }).run(),
      isActive: editorState?.isHeading3 ?? false,
    },
    {
      kind: 'button',
      icon: Type,
      labelKey: 'paragraph',
      action: () => editor?.chain().setParagraph().run(),
      isActive: editorState?.isParagraph ?? false,
    },
    { kind: 'separator' },
    {
      kind: 'button',
      icon: Bold,
      labelKey: 'bold',
      action: () => editor?.chain().toggleBold().run(),
      isActive: editorState?.isBold ?? false,
    },
    {
      kind: 'button',
      icon: Italic,
      labelKey: 'italic',
      action: () => editor?.chain().toggleItalic().run(),
      isActive: editorState?.isItalic ?? false,
    },
    {
      kind: 'button',
      icon: UnderlineIcon,
      labelKey: 'underline',
      action: () => editor?.chain().toggleUnderline().run(),
      isActive: editorState?.isUnderline ?? false,
    },
    { kind: 'separator' },
    {
      kind: 'button',
      icon: List,
      labelKey: 'bulletList',
      action: () => editor?.chain().toggleBulletList().run(),
      isActive: editorState?.isBulletList ?? false,
    },
    {
      kind: 'button',
      icon: ListOrdered,
      labelKey: 'orderedList',
      action: () => editor?.chain().toggleOrderedList().run(),
      isActive: editorState?.isOrderedList ?? false,
    },
  ];

  // eslint-disable-next-line no-restricted-syntax -- TipTap is an imperative API; we must sync content via commands when the included items set changes
  useEffect(() => {
    if (!editor) {
      return;
    }

    const letterLabels: LetterLabels = {
      reasonLabel: t('SupplementaryRequestLetter.letter.reasonLabel'),
    };
    const { newIds, wasInitialized } = syncEditorContent(
      editor,
      includedItems,
      prevIncludedIdsRef.current,
      initializedRef.current,
      letterLabels,
    );

    initializedRef.current = wasInitialized;
    prevIncludedIdsRef.current = newIds;
  }, [editor, includedItems, i18n.language, t]);

  const handleExportPdf = () => {
    if (!editor) {
      return;
    }
    exportPdf(
      editor,
      t('SupplementaryRequestLetter.export.pdfTitle'),
      i18n.resolvedLanguage ?? i18n.language,
    );
  };

  const handleExportDocx = () => {
    if (!editor) {
      return;
    }
    void exportDocx(editor, t('SupplementaryRequestLetter.export.filename'));
  };

  const hasContent = includedItems.length > 0;
  const preventMouseFocusShift = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SwimlaneHeaderPortal>
        <span aria-hidden="true" className="rounded-lg bg-bg-quaternary p-2">
          <FileText className="size-4" />
        </span>
        <h2 className="flex-1 text-left text-[13px] font-medium tracking-[-0.13px] text-brand-950">
          {t('page.lanes.letter')}{' '}
          {formatDate(sessionDate, i18n.resolvedLanguage ?? 'de-DE')}
        </h2>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={!hasContent || !editor}
            onClick={handleExportPdf}
          >
            <Download className="size-4" aria-hidden="true" />
            {t('SupplementaryRequestLetter.downloadPdf')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!hasContent || !editor}
            onClick={handleExportDocx}
          >
            <Download className="size-4" aria-hidden="true" />
            {t('SupplementaryRequestLetter.downloadWord')}
          </Button>
        </div>
      </SwimlaneHeaderPortal>

      <div
        role="toolbar"
        aria-label={t('SupplementaryRequestLetter.title')}
        className="flex shrink-0 items-center gap-1 border-b border-border-primary px-4 py-2"
      >
        {toolbarItems.map((item, index) =>
          item.kind === 'separator' ? (
            <div
              key={`sep-${index.toString()}`}
              role="separator"
              aria-orientation="vertical"
              className="mx-1 h-5 w-px bg-border-primary"
            />
          ) : (
            <Button
              key={item.labelKey}
              iconOnly
              variant={item.isActive ? 'secondary' : 'ghost'}
              size="sm"
              onMouseDown={preventMouseFocusShift}
              onClick={item.action}
              aria-label={t(
                `SupplementaryRequestLetter.toolbar.${item.labelKey}`,
              )}
              aria-pressed={item.isActive}
              disabled={!editor}
            >
              <item.icon />
            </Button>
          ),
        )}
      </div>

      <div className="h-0 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
        {hasContent ? (
          <EditorContent editor={editor} className="h-full" />
        ) : (
          <p className="text-sm text-text-secondary">
            {t('SupplementaryRequestLetter.emptyState')}
          </p>
        )}
      </div>
    </div>
  );
};
