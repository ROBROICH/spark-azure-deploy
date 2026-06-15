import { CircleHelp } from 'lucide-react';
import type { ComponentProps, ComponentType } from 'react';

import { cn } from '@/features/ui/style/cn';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/features/ui/tooltip/Tooltip';

type InfoTooltipProps = {
  content: ComponentProps<typeof TooltipContent>['children'];
  ariaLabel: string;
  className?: string;
  icon?: ComponentType<{
    className?: string;
    'aria-hidden'?: boolean | 'true' | 'false';
  }>;
  iconClassName?: string;
  tooltipClassName?: string;
  tooltipMaxWidthClassName?: string;
  side?: ComponentProps<typeof TooltipContent>['side'];
  hidden?: boolean;
};

export function InfoTooltip(props: InfoTooltipProps) {
  const {
    content,
    ariaLabel,
    className,
    icon: Icon = CircleHelp,
    iconClassName,
    tooltipClassName,
    tooltipMaxWidthClassName = 'max-w-[32rem]',
    side = 'top',
    hidden = false,
  } = props;

  if (hidden) {
    return null;
  }

  const trigger = (
    <button
      type="button"
      aria-label={ariaLabel}
      className={cn(
        'focus-ring inline-flex items-center justify-center rounded-full text-current',
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('size-[1em] text-current', iconClassName)}
      />
    </button>
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>{trigger}</TooltipTrigger>
      <TooltipContent
        side={side}
        className={cn(
          'whitespace-pre-line',
          tooltipMaxWidthClassName,
          tooltipClassName,
        )}
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
