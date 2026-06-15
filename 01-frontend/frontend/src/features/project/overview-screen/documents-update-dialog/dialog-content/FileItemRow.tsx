import { cn } from '@/features/ui/style/cn';
import {
  CircleCheck,
  File,
  FileWarning,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react';
import type { ComponentType, SVGProps } from 'react';
import { useTranslation } from 'react-i18next';
import { OverflowTooltip } from '@/features/ui/tooltip/Tooltip';
import type { UploadFile } from '../DocumentsUploadContext';

const KB = 1024;
const MB = KB * KB;

const formatFileSize = (bytes: number): string => {
  if (bytes >= MB) {
    return `${(bytes / MB).toFixed(1)} MB`;
  }
  if (bytes >= KB) {
    return `${Math.round(bytes / KB)} KB`;
  }
  return `${bytes} B`;
};

type FileVisualState =
  | 'queued'
  | 'uploading'
  | 'success'
  | 'unsupported'
  | 'failed';

const TEXT_COLOR_BY_STATE = {
  queued: 'text-slate-600',
  uploading: 'text-slate-600',
  success: 'text-green-800',
  unsupported: 'text-orange-800',
  failed: 'text-red-900',
} as const satisfies Record<FileVisualState, string>;

const ICON_BY_STATE = {
  queued: File,
  uploading: LoaderCircle,
  success: CircleCheck,
  unsupported: FileWarning,
  failed: TriangleAlert,
} as const satisfies Record<
  FileVisualState,
  ComponentType<SVGProps<SVGSVGElement>>
>;

const resolveState = (entry: UploadFile): FileVisualState => {
  if (entry.status === 'error') {
    return entry.errorReason === 'upload-failed' ? 'failed' : 'unsupported';
  }
  return entry.status;
};

type FileItemRowProps = {
  entry: UploadFile;
};

export const FileItemRow = (props: FileItemRowProps) => {
  const { entry } = props;
  const { t } = useTranslation('Project');

  const state = resolveState(entry);
  const textColor = TEXT_COLOR_BY_STATE[state];
  const LeadingIcon = ICON_BY_STATE[state];
  const showUnsupportedBadge = state === 'unsupported';
  const showFailedBadge = state === 'failed';
  const statusLabel = t(`Documents.updateDocuments.upload.status.${state}`);

  return (
    <div className="flex items-center gap-2 rounded-lg p-1">
      <span className="flex size-6 shrink-0 items-center justify-center">
        <LeadingIcon
          className={cn(
            'size-4',
            textColor,
            state === 'uploading' && 'animate-spin',
          )}
          aria-hidden
        />
      </span>
      <span className="sr-only">{statusLabel}</span>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <OverflowTooltip content={entry.file.name} side="top">
          <span
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- tooltip trigger anchor inside TooltipTrigger asChild; tabIndex makes truncated text keyboard-accessible
            tabIndex={0}
            className={cn(
              'focus-ring truncate rounded text-[13px] leading-[18px] font-medium tracking-[-0.01em]',
              textColor,
            )}
          >
            {entry.file.name}
          </span>
        </OverflowTooltip>
        <span
          className={cn(
            'shrink-0 text-[11px] leading-[14px] tracking-[0.02em]',
            textColor,
          )}
        >
          {formatFileSize(entry.file.size)}
        </span>
      </div>
      {showUnsupportedBadge && (
        <span className="inline-flex h-6 shrink-0 items-center rounded border-[0.5px] border-orange-600 bg-orange-50 px-2 text-[11px] leading-[14px] font-medium tracking-[0.02em] text-orange-900">
          {t('Documents.updateDocuments.upload.errors.unsupportedFormat')}
        </span>
      )}
      {showFailedBadge && (
        <span className="inline-flex h-6 shrink-0 items-center rounded border-[0.5px] border-red-600 bg-red-50 px-2 text-[11px] leading-[14px] font-medium tracking-[0.02em] text-red-900">
          {t('Documents.updateDocuments.upload.errors.uploadFailed')}
        </span>
      )}
    </div>
  );
};
