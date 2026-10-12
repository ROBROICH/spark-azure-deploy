import { Accordion } from '@/features/ui/accordion/Accordion';
import { Button } from '@/features/ui/button/Button';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { useTranslation } from 'react-i18next';

import type { LawPickerGroup, LawPickerStatus } from './legalBasisPicker.model';
import { LawPickerGroupRow } from './LawPickerGroupRow';

type LawNormPickerProps = {
  groups: LawPickerGroup[];
  selectedIds: ReadonlySet<string>;
  status: LawPickerStatus;
  onToggleNorm: (id: string) => void;
  onToggleGroup: (groupId: string) => void;
  onRetry?: () => void;
};

const LawNormPickerSkeleton = () => (
  <div className="flex flex-col gap-2" {...skeletonListProps}>
    {Array.from({ length: 6 }).map((_, index) => (
      <div
        key={index}
        className="rounded-[8px] border border-border-primary p-3"
      >
        <div className="flex items-center gap-3">
          <Skeleton className="size-4 rounded-sm" aria-hidden />
          <Skeleton className="h-4 flex-1" aria-hidden />
          <Skeleton className="h-6 w-24 rounded-full" aria-hidden />
        </div>
      </div>
    ))}
  </div>
);

export const LawNormPicker = (props: LawNormPickerProps) => {
  const { groups, selectedIds, status, onToggleNorm, onToggleGroup, onRetry } =
    props;
  const { t } = useTranslation('LegalBasisPicker');

  if (status === 'loading') {
    return (
      <div role="status" aria-label={t('loading')}>
        <LawNormPickerSkeleton />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-sm text-text-secondary">
          {t('error')}
        </p>
        {onRetry ? (
          <Button type="button" variant="secondary" size="sm" onClick={onRetry}>
            {t('retry')}
          </Button>
        ) : null}
      </div>
    );
  }

  if (status === 'empty' || groups.length === 0) {
    return <p className="text-sm text-text-secondary">{t('empty')}</p>;
  }

  return (
    <Accordion className="flex flex-col gap-2">
      {groups.map((group) => (
        <LawPickerGroupRow
          key={group.id}
          group={group}
          selectedIds={selectedIds}
          onToggleNorm={onToggleNorm}
          onToggleGroup={onToggleGroup}
        />
      ))}
    </Accordion>
  );
};
