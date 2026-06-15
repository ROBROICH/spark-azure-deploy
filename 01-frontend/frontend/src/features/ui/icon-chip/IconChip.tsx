import { cn } from '@/features/ui/style/cn';
import type React from 'react';
import { TooltipWrapper } from '../tooltip/TooltipWrapper';

type IconChipCommonProps = {
  ariaLabel: string;
  className?: string;
  icon: React.ReactNode;
  iconClassName?: string;
  tooltip?: React.ReactNode;
  tooltipAlign?: React.ComponentProps<typeof TooltipWrapper>['align'];
  tooltipArrowClassName?: string;
  tooltipClassName?: string;
  tooltipSide?: React.ComponentProps<typeof TooltipWrapper>['side'];
  tooltipSideOffset?: React.ComponentProps<typeof TooltipWrapper>['sideOffset'];
  tooltipTriggerMode?: React.ComponentProps<
    typeof TooltipWrapper
  >['triggerMode'];
};

type IconChipButtonProps = IconChipCommonProps &
  Omit<
    React.ComponentProps<'button'>,
    'aria-label' | 'children' | 'className'
  > & {
    as?: 'button';
  };

type IconChipSpanProps = IconChipCommonProps &
  Omit<
    React.ComponentProps<'span'>,
    'aria-label' | 'children' | 'className'
  > & {
    as: 'span';
  };

type IconChipProps = IconChipButtonProps | IconChipSpanProps;

const CHIP_CLASS_NAME =
  'inline-flex size-[25px] shrink-0 items-center justify-center rounded-[4px] border-[0.5px] p-1 leading-none';

export function IconChip(props: IconChipProps) {
  const {
    ariaLabel,
    as = 'button',
    className,
    icon,
    iconClassName,
    tooltip,
    tooltipAlign,
    tooltipArrowClassName,
    tooltipClassName,
    tooltipSide,
    tooltipSideOffset,
    tooltipTriggerMode,
    ...restProps
  } = props;
  const iconElement = (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center [&>svg]:size-4 [&>svg]:shrink-0',
        iconClassName,
      )}
    >
      {icon}
    </span>
  );
  const chipClassName = cn(
    CHIP_CLASS_NAME,
    as === 'button' ? 'focus-ring' : undefined,
    className,
  );
  const chip =
    as === 'span' ? (
      <span
        role="img"
        aria-label={ariaLabel}
        className={chipClassName}
        {...(restProps as Omit<
          React.ComponentProps<'span'>,
          'aria-label' | 'children' | 'className'
        >)}
      >
        {iconElement}
      </span>
    ) : (
      <button
        type="button"
        aria-label={ariaLabel}
        className={chipClassName}
        {...(restProps as Omit<
          React.ComponentProps<'button'>,
          'aria-label' | 'children' | 'className'
        >)}
      >
        {iconElement}
      </button>
    );

  return (
    <TooltipWrapper
      content={tooltip}
      align={tooltipAlign}
      arrowClassName={tooltipArrowClassName}
      className={tooltipClassName}
      side={tooltipSide}
      sideOffset={tooltipSideOffset}
      triggerMode={tooltipTriggerMode}
    >
      {chip}
    </TooltipWrapper>
  );
}
