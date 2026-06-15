import { cn } from '@/features/ui/style/cn';
import type { ComponentPropsWithoutRef } from 'react';

export type StepStatus = 'default' | 'selected';

export type StepIndicatorProps = ComponentPropsWithoutRef<'div'> & {
  status: StepStatus;
  stepNumber: number;
  /** Optional text shown after the circle. */
  label?: string;
};

export const StepIndicator = (props: StepIndicatorProps) => {
  const { status, stepNumber, label, className, ...rest } = props;

  const isSelected = status === 'selected';
  const hasLabel = label !== undefined && label !== '';

  return (
    <div
      className={cn(
        'flex w-full items-center justify-center gap-2 px-4 py-3',
        isSelected
          ? 'border-b border-brand-navy'
          : 'border-b border-neutral-200',
        className,
      )}
      aria-current={isSelected ? 'step' : undefined}
      {...rest}
    >
      <div
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full',
          isSelected ? 'bg-neutral-200' : 'bg-neutral-100',
        )}
      >
        <span
          className={cn(
            'text-xs font-medium tabular-nums',
            isSelected ? 'text-brand-navy' : 'text-text-secondary',
          )}
        >
          {stepNumber}
        </span>
      </div>

      {hasLabel && (
        <span
          className={cn(
            'text-sm font-medium',
            isSelected ? 'text-brand-navy' : 'text-text-secondary',
          )}
        >
          {label}
        </span>
      )}
    </div>
  );
};
