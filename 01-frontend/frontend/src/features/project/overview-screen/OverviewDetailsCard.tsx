import { Button } from '@/features/ui/button/Button';
import { Skeleton, skeletonListProps } from '@/features/ui/skeleton/Skeleton';
import { cn } from '@/features/ui/style/cn';
import { Pencil } from 'lucide-react';
import { useId } from 'react';
import type { ReactNode } from 'react';

type OverviewDetailsRow = {
  key: string;
  label: ReactNode;
  value: ReactNode;
  labelTone?: 'primary' | 'secondary';
  valueClassName?: string;
  hasBottomBorder?: boolean;
};

type OverviewDetailsCardSkeletonProps = {
  rowCount: number;
};

type OverviewDetailsCardProps = {
  title: ReactNode;
  editAriaLabel: string;
  canEdit: boolean;
  isEditing: boolean;
  onEdit: () => void;
  rows: OverviewDetailsRow[];
  children: ReactNode;
};

const rowClassName = 'flex items-start border-border-primary';
const labelClassName =
  'w-36 shrink-0 px-3 py-[11px] text-sm font-medium tracking-tight';
const valueClassName =
  'm-0 min-w-0 flex-1 px-3 py-[11px] text-sm tracking-tight break-words text-text-secondary';

export const OverviewDetailsCardSkeleton = (
  props: OverviewDetailsCardSkeletonProps,
) => {
  const { rowCount } = props;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 pr-1">
        <Skeleton className="h-[18px] flex-1" aria-hidden />
        <Skeleton className="size-6 rounded-lg" aria-hidden />
      </div>
      <div
        className="overflow-clip rounded-lg border border-border-primary"
        {...skeletonListProps}
      >
        {Array.from({ length: rowCount }).map((_, i) => (
          <div
            key={i}
            className="flex items-center border-b border-border-primary last:border-b-0"
          >
            <div className="w-36 shrink-0 px-3 py-[11px]">
              <Skeleton className="h-[18px] w-24" aria-hidden />
            </div>
            <div className="flex-1 px-3 py-[11px]">
              <Skeleton className="h-[18px]" aria-hidden />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const OverviewDetailsCard = (props: OverviewDetailsCardProps) => {
  const { title, editAriaLabel, canEdit, isEditing, onEdit, rows, children } =
    props;
  const headingId = useId();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2 pr-1">
        <h3
          id={headingId}
          className="min-w-0 flex-1 text-sm font-medium tracking-tight text-text-primary"
        >
          {title}
        </h3>
        {!isEditing && canEdit ? (
          <Button
            type="button"
            iconOnly
            variant="ghost-light"
            aria-label={editAriaLabel}
            onClick={onEdit}
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
        ) : null}
      </div>

      {isEditing ? (
        children
      ) : (
        <dl
          aria-labelledby={headingId}
          className="m-0 overflow-clip rounded-lg border border-border-primary bg-neutral-white"
        >
          {rows.map((row) => (
            <div
              key={row.key}
              className={cn(
                rowClassName,
                (row.hasBottomBorder ?? true) ? 'border-b' : undefined,
              )}
            >
              <dt
                className={cn(
                  labelClassName,
                  row.labelTone === 'secondary'
                    ? 'text-text-secondary'
                    : 'text-text-primary',
                )}
              >
                {row.label}
              </dt>
              <dd className={cn(valueClassName, row.valueClassName)}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};
