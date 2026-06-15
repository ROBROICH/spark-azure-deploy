import { cn } from '@/features/ui/style/cn';
import type { ReactNode } from 'react';
import { AiSparklesChip } from './AiSparklesChip';

type AiReferenceCardProps = {
  title: string;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  titleTrailing?: ReactNode;
};

export function AiReferenceCard(props: AiReferenceCardProps) {
  const { title, children, className, contentClassName, titleTrailing } = props;

  return (
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-slate-200 bg-slate-50',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 p-1">
        <AiSparklesChip size="sm" aria-hidden="true" />
        <span
          className="min-w-0 flex-1 truncate bg-clip-text text-[11px] leading-[14px] font-medium tracking-[0.02em] text-transparent"
          style={{
            backgroundImage:
              'linear-gradient(180deg, var(--effect-gradient-ai-text-icon-primary) 0%, var(--effect-gradient-ai-text-icon-secondary) 100%)',
          }}
        >
          {title}
        </span>
        {titleTrailing}
      </div>
      <div className={cn('flex flex-col gap-1', contentClassName)}>
        {children}
      </div>
    </div>
  );
}
