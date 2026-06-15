import { cn } from '@/features/ui/style/cn';

type ProgressBarProps = {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
  progress?: number;
};

export const ProgressBar = (props: ProgressBarProps) => {
  const { ariaLabel, ariaLabelledBy, className, progress } = props;
  const isDeterminate = progress !== undefined;
  const clamped = isDeterminate ? Math.min(Math.max(progress, 0), 1) : 0;

  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isDeterminate ? Math.round(clamped * 100) : undefined}
      className={cn(
        'h-2 w-full overflow-hidden rounded-full bg-slate-100',
        className,
      )}
    >
      <span
        className="progress-bar-gradient-fill block h-full rounded-full transition-[width] duration-500 data-[indeterminate=true]:w-full"
        data-indeterminate={!isDeterminate}
        style={{
          width: isDeterminate ? `${clamped * 100}%` : undefined,
        }}
      />
    </div>
  );
};
