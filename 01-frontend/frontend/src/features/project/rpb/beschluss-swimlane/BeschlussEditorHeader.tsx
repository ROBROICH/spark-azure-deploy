import type { Editor } from '@tiptap/core';
import type { ReactNode } from 'react';
import { Download } from 'lucide-react';
import { SplitButton } from '@/features/ui/button/SplitButton';
import { BeschlussEditorSavedBadge } from './BeschlussEditorSavedBadge';
import { BeschlussEditorToolbar } from './BeschlussEditorToolbar';

type BeschlussEditorHeaderProps = {
  canExport: boolean;
  editor: Editor | null;
  editorContentId: string;
  headerAccessory?: ReactNode;
  onExportClick: () => void;
  t: (key: string) => string;
};

export const BeschlussEditorHeader = (props: BeschlussEditorHeaderProps) => {
  const {
    canExport,
    editor,
    editorContentId,
    headerAccessory,
    onExportClick,
    t,
  } = props;

  return (
    <div className="flex flex-wrap items-center justify-between border-b border-border-primary bg-white p-2">
      <BeschlussEditorToolbar
        editor={editor}
        editorContentId={editorContentId}
        t={t}
      />

      <div className="flex flex-wrap items-center gap-2">
        {headerAccessory}
        <BeschlussEditorSavedBadge />
        <SplitButton
          size="sm"
          checked={false}
          uncheckedLabel={t('beschluss.export')}
          uncheckedIcon={<Download className="size-4 shrink-0" />}
          disabled={!canExport}
          onCheckedChange={onExportClick}
        />
      </div>
    </div>
  );
};
