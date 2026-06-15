import { Button } from '@/features/ui/button/Button';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { Bold, Italic, UnderlineIcon } from 'lucide-react';
import type { MouseEvent } from 'react';

type BeschlussEditorToolbarProps = {
  editor: Editor | null;
  editorContentId: string;
  t: (key: string) => string;
};

export const BeschlussEditorToolbar = (props: BeschlussEditorToolbarProps) => {
  const { editor, editorContentId, t } = props;
  const preventMouseFocusShift = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
  };

  const editorMarks = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      isBold: e?.isActive('bold') ?? false,
      isUnderline: e?.isActive('underline') ?? false,
      isItalic: e?.isActive('italic') ?? false,
    }),
  }) ?? {
    isBold: false,
    isUnderline: false,
    isItalic: false,
  };
  const { isBold, isUnderline, isItalic } = editorMarks;

  const toggleBold = () => {
    editor?.chain().toggleBold().run();
  };

  const toggleUnderline = () => {
    editor?.chain().toggleUnderline().run();
  };

  const toggleItalic = () => {
    editor?.chain().toggleItalic().run();
  };

  return (
    <div
      role="toolbar"
      aria-label={t('beschluss.toolbar.ariaLabel')}
      aria-controls={editorContentId}
      className="flex items-center gap-1"
    >
      <Button
        iconOnly
        variant={isBold ? 'secondary' : 'ghost'}
        size="sm"
        aria-label={t('beschluss.toolbar.boldAria')}
        aria-pressed={isBold}
        disabled={!editor}
        onMouseDown={preventMouseFocusShift}
        onClick={toggleBold}
      >
        <Bold />
      </Button>
      <Button
        iconOnly
        variant={isUnderline ? 'secondary' : 'ghost'}
        size="sm"
        aria-label={t('beschluss.toolbar.underlineAria')}
        aria-pressed={isUnderline}
        disabled={!editor}
        onMouseDown={preventMouseFocusShift}
        onClick={toggleUnderline}
      >
        <UnderlineIcon />
      </Button>
      <Button
        iconOnly
        variant={isItalic ? 'secondary' : 'ghost'}
        size="sm"
        aria-label={t('beschluss.toolbar.italicAria')}
        aria-pressed={isItalic}
        disabled={!editor}
        onMouseDown={preventMouseFocusShift}
        onClick={toggleItalic}
      >
        <Italic />
      </Button>
    </div>
  );
};
