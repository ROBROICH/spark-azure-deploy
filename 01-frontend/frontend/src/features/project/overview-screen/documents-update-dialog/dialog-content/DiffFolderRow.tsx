import { cn } from '@/features/ui/style/cn';
import { ChevronDown, ChevronRight, Folder } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const FOLDER_INDENT_PX = 16;

type DiffFolderRowProps = {
  name: string;
  documentCount: number;
  depth: number;
  isExpanded: boolean;
  onToggle: () => void;
};

export const DiffFolderRow = (props: DiffFolderRowProps) => {
  const { name, documentCount, depth, isExpanded, onToggle } = props;
  const { t } = useTranslation('Project');
  const Chevron = isExpanded ? ChevronDown : ChevronRight;

  return (
    <button
      type="button"
      aria-expanded={isExpanded}
      aria-label={t('Documents.updateDocuments.diff.folderAria', {
        name,
        count: documentCount,
      })}
      onClick={onToggle}
      style={{ paddingLeft: depth * FOLDER_INDENT_PX }}
      className={cn(
        'focus-ring flex w-full items-center gap-2 rounded-lg p-1 text-left',
        'hover:bg-slate-100',
      )}
    >
      <span className="flex size-6 shrink-0 items-center justify-center text-slate-700">
        <Chevron aria-hidden className="size-4" />
      </span>
      <Folder aria-hidden className="size-4 shrink-0 text-slate-700" />
      <span className="min-w-0 flex-1 truncate text-[13px] leading-[18px] font-medium tracking-[-0.01em] text-brand-navy">
        {name}
      </span>
      <span className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-700">
        {t('Documents.updateDocuments.diff.documentsCount', {
          count: documentCount,
        })}
      </span>
    </button>
  );
};
