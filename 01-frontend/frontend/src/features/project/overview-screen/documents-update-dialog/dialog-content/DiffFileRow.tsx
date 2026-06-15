import { cn } from '@/features/ui/style/cn';
import {
  FileMinus2,
  FilePlus2,
  FileType2,
  FileUp,
  RefreshCw,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { Checkbox } from '@/features/ui/checkbox/Checkbox';
import { DocumentChangeBadge, type ChangeType } from './DocumentChangeBadge';
import { MiddleTruncate } from '@/features/ui/middle-truncate/MiddleTruncate';

const COLOR_BY_CHANGE = {
  new: 'text-green-900',
  replaced: 'text-blue-900',
  deleted: 'text-red-900',
  renamed: 'text-orange-900',
  unchanged: 'text-slate-700',
} as const satisfies Record<ChangeType, string>;

const ICON_BY_CHANGE = {
  new: FilePlus2,
  replaced: RefreshCw,
  deleted: FileMinus2,
  renamed: FileUp,
  unchanged: FileType2,
} as const satisfies Record<ChangeType, ComponentType<SVGProps<SVGSVGElement>>>;

const PLACEHOLDER_DASH = '-';

type SelectionAffordance = {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
};

type DiffFileRowProps = {
  filename: string | null;
  changeType: ChangeType;
  showBadge?: boolean;
  selection?: SelectionAffordance;
};

export const DiffFileRow = (props: DiffFileRowProps) => {
  const { filename, changeType, showBadge = false, selection } = props;
  const displayName = filename ?? PLACEHOLDER_DASH;
  const isDeselected = selection !== undefined && !selection.checked;
  const Icon = ICON_BY_CHANGE[changeType];
  const textColor = COLOR_BY_CHANGE[changeType];

  return (
    <div className="flex items-center gap-2 rounded-lg p-1 hover:bg-slate-100">
      <div
        className={cn(
          'flex min-w-0 flex-1 items-center gap-2',
          isDeselected && 'opacity-[0.76]',
        )}
      >
        <span className="flex size-6 shrink-0 items-center justify-center">
          <Icon className={cn('size-4', textColor)} aria-hidden />
        </span>
        <MiddleTruncate
          text={displayName}
          className={cn(
            'min-w-0 flex-1 text-[13px] leading-[18px] font-medium tracking-[-0.01em]',
            textColor,
          )}
        />
        {showBadge && <DocumentChangeBadge changeType={changeType} />}
      </div>
      {selection ? (
        <Checkbox
          ariaLabel={selection.ariaLabel}
          checked={selection.checked ? 'checked' : 'unchecked'}
          onCheckedChange={selection.onToggle}
        />
      ) : (
        <span className="size-6 shrink-0" aria-hidden />
      )}
    </div>
  );
};
