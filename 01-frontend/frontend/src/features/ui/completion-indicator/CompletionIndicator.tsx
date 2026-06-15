import { cn } from '@/features/ui/style/cn';
import type { ReactNode } from 'react';
import { CompletionRing } from './CompletionRing';

type CompletionIndicatorProps = {
  completed: number;
  total: number;
  children: ReactNode;
  className?: string;
  labelClassName?: string;
  ringClassName?: string;
};

/** Combined progress indicator with a completion ring and progress label. */
export const CompletionIndicator = (props: CompletionIndicatorProps) => {
  const {
    completed,
    total,
    children,
    className,
    labelClassName,
    ringClassName,
  } = props;
  const completionPercentage =
    total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div
      className={cn('flex items-center gap-2 rounded-lg px-2 py-1', className)}
    >
      <CompletionRing
        percentage={completionPercentage}
        className={cn('size-4', ringClassName)}
      />
      <span
        className={cn(
          'text-[11px] leading-[14px] font-medium tracking-[0.02em] text-[#166534]',
          labelClassName,
        )}
      >
        {children}
      </span>
    </div>
  );
};
