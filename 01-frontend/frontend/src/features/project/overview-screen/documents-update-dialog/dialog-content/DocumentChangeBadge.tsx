import { useTranslation } from 'react-i18next';

import { cn } from '@/features/ui/style/cn';

export type ChangeType =
  | 'new'
  | 'replaced'
  | 'deleted'
  | 'renamed'
  | 'unchanged';

type DocumentChangeBadgeProps = {
  changeType: ChangeType;
};

const BADGE_STYLES = {
  new: 'border-green-700 bg-green-50 text-green-900',
  replaced: 'border-blue-600 bg-blue-50 text-blue-900',
  deleted: 'border-red-600 bg-red-50 text-red-900',
  renamed: 'border-orange-600 bg-orange-50 text-orange-900',
  unchanged: '',
} as const satisfies Record<ChangeType, string>;

const TRANSLATION_KEYS = {
  new: 'Documents.updateDocuments.diff.changes.new',
  replaced: 'Documents.updateDocuments.diff.changes.replaced',
  deleted: 'Documents.updateDocuments.diff.changes.deleted',
  renamed: 'Documents.updateDocuments.diff.changes.renamed',
  unchanged: 'Documents.updateDocuments.diff.changes.unchanged',
} as const satisfies Record<ChangeType, string>;

export const DocumentChangeBadge = (props: DocumentChangeBadgeProps) => {
  const { changeType } = props;
  const { t } = useTranslation('Project');

  if (changeType === 'unchanged') {
    return null;
  }

  return (
    <span
      data-change-type={changeType}
      className={cn(
        'inline-flex h-6 shrink-0 items-center rounded border-[0.5px] px-2 text-[11px] leading-[14px] font-medium tracking-[0.02em]',
        BADGE_STYLES[changeType],
      )}
    >
      {t(TRANSLATION_KEYS[changeType])}
    </span>
  );
};
