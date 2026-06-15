import { ProgressBar } from '@/features/ui/progress-bar/ProgressBar';
import { cn } from '@/features/ui/style/cn';
import type { ReactNode } from 'react';
import type { WorkflowProgress } from './useWorkflowProgress';

type FakeProgressProps = WorkflowProgress & {
  ariaLabel?: string;
  ariaLabelledBy?: string;
  className?: string;
  description?: ReactNode;
  descriptionClassName?: string;
};

export const FakeProgress = (props: FakeProgressProps) => {
  const {
    ariaLabel,
    ariaLabelledBy,
    className,
    description,
    descriptionClassName,
    progress,
  } = props;

  return (
    <div className={cn('flex w-full flex-col gap-3', className)}>
      <ProgressBar
        ariaLabel={ariaLabel}
        ariaLabelledBy={ariaLabelledBy}
        progress={progress}
      />
      {description ? (
        <p
          className={cn(
            'text-center text-[13px] leading-[18px] text-purple-900',
            descriptionClassName,
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
};
