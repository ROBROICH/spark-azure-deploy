import { cn } from '@/features/ui/style/cn';
import type React from 'react';
import { IconChip } from '../icon-chip/IconChip';
import {
  AI_SPARKLES_CHIP_BACKGROUND,
  getAiGradientHoverProps,
} from './AiSparklesChip';
import { AiSparklesIcon } from './AiSparklesIcon';

const AI_HOVER_PROPS = getAiGradientHoverProps<HTMLButtonElement>();

type AiStatusChipProps = Omit<React.ComponentProps<'button'>, 'children'> & {
  ariaLabel: string;
  tooltip?: React.ReactNode;
  tooltipSide?: React.ComponentProps<typeof IconChip>['tooltipSide'];
  tooltipAlign?: React.ComponentProps<typeof IconChip>['tooltipAlign'];
  tooltipClassName?: string;
  tooltipArrowClassName?: string;
};

export function AiStatusChip(props: AiStatusChipProps) {
  const {
    ariaLabel,
    tooltip,
    tooltipSide,
    tooltipAlign,
    tooltipClassName,
    tooltipArrowClassName,
    className,
    type = 'button',
    style,
    ...restProps
  } = props;

  const isInteractive = Boolean(restProps.onClick);
  const { onPointerEnter, onPointerLeave, onFocus, onBlur, ...rest } =
    restProps;

  return (
    <IconChip
      ariaLabel={ariaLabel}
      className={cn('border-purple-700 shadow-elevated', className)}
      icon={<AiSparklesIcon />}
      style={{ ...style, background: AI_SPARKLES_CHIP_BACKGROUND }}
      tooltip={tooltip}
      tooltipAlign={tooltipAlign}
      tooltipArrowClassName={tooltipArrowClassName}
      tooltipClassName={tooltipClassName}
      tooltipSide={tooltipSide}
      type={type}
      onPointerEnter={
        isInteractive
          ? (e) => {
              AI_HOVER_PROPS.onPointerEnter(e);
              onPointerEnter?.(e);
            }
          : onPointerEnter
      }
      onPointerLeave={
        isInteractive
          ? (e) => {
              AI_HOVER_PROPS.onPointerLeave(e);
              onPointerLeave?.(e);
            }
          : onPointerLeave
      }
      onFocus={
        isInteractive
          ? (e) => {
              AI_HOVER_PROPS.onFocus(e);
              onFocus?.(e);
            }
          : onFocus
      }
      onBlur={
        isInteractive
          ? (e) => {
              AI_HOVER_PROPS.onBlur(e);
              onBlur?.(e);
            }
          : onBlur
      }
      {...rest}
    />
  );
}
