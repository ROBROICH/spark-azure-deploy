import { cn } from '@/features/ui/style/cn';
import type { ElementType, ReactNode } from 'react';
import { AiSparklesChip } from '../ai/AiSparklesChip';

type SwimlaneHeaderProps = {
  icon: ElementType;
  title: string;
  headingId?: string;
  /** Heading level used for the title. Defaults to `'h2'`. */
  headingLevel?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  variant?: 'ai';
  action?: ReactNode;
  children?: ReactNode;
  overrideContent?: ReactNode;
  hasOverrideContent?: boolean;
  className?: string;
};

export const SwimlaneHeader = (props: SwimlaneHeaderProps) => {
  const {
    icon: Icon,
    title,
    headingId,
    headingLevel: Heading = 'h2',
    variant,
    action,
    children,
    overrideContent,
    hasOverrideContent = false,
    className,
  } = props;

  const isAi = variant === 'ai';

  return (
    <div
      className={cn(
        'flex min-h-12 flex-nowrap items-center gap-1 border-b border-b-border-primary bg-bg-primary p-2 text-[13px] font-medium tracking-[-0.13px] text-brand-950 md:gap-2',
        className,
      )}
    >
      {hasOverrideContent ? (
        <Heading id={headingId} className="sr-only">
          {title}
        </Heading>
      ) : (
        <>
          {isAi ? (
            <AiSparklesChip aria-hidden="true" />
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex rounded-lg bg-bg-quaternary p-2"
            >
              <Icon className="size-4" />
            </span>
          )}
          {isAi ? (
            <Heading
              id={headingId}
              className="text-ai-gradient flex-1 text-left"
            >
              {title}
            </Heading>
          ) : (
            <Heading id={headingId} className="flex-1 text-left">
              {title}
            </Heading>
          )}
          {children}
          {action}
        </>
      )}
      {overrideContent}
    </div>
  );
};
