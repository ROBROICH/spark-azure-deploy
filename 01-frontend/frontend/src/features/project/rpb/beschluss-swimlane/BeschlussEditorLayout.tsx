import type { Editor } from '@tiptap/core';
import { EditorContent } from '@tiptap/react';
import type { ReactNode } from 'react';
import { BeschlussEditorHeader } from './BeschlussEditorHeader';

type BeschlussEditorLayoutProps = {
  canExport: boolean;
  editor: Editor | null;
  editorContentId: string;
  headerAccessory?: ReactNode;
  onExportClick: () => void;
  t: (key: string) => string;
};

export const BeschlussEditorLayout = (props: BeschlussEditorLayoutProps) => {
  const {
    canExport,
    editor,
    editorContentId,
    headerAccessory,
    onExportClick,
    t,
  } = props;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50">
      <BeschlussEditorHeader
        canExport={canExport}
        editor={editor}
        editorContentId={editorContentId}
        headerAccessory={headerAccessory}
        onExportClick={onExportClick}
        t={t}
      />

      <EditorContent
        id={editorContentId}
        editor={editor}
        className="min-h-0 flex-1 overflow-auto bg-slate-50"
      />
    </div>
  );
};
