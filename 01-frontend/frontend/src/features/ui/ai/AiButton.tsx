import { cn } from '@/features/ui/style/cn';
import { LoaderCircle } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { AiSparklesIcon } from './AiSparklesIcon';
import {
  AI_SPARKLES_CHIP_BACKGROUND,
  getAiGradientHoverProps,
} from './AiSparklesChip';
import { TooltipWrapper } from '../tooltip/TooltipWrapper';

const AI_BUTTON_SIZE_CLASSES = {
  xs: 'h-6 rounded-[4px] px-2 text-[11px] leading-[14px]',
  sm: 'h-8 rounded-lg px-3 text-[11px] leading-[14px]',
  md: 'h-9 rounded-lg px-3 text-sm',
  default: 'h-9 rounded-lg px-3 py-[9px] text-[11px] leading-[14px]',
  lg: 'h-11 rounded-lg px-4 text-base',
} as const;

type AiButtonSize = keyof typeof AI_BUTTON_SIZE_CLASSES;

const AI_BUTTON_ICON_SIZE_CLASSES = {
  xs: 'size-4 shrink-0',
  sm: 'size-4 shrink-0',
  md: 'size-4 shrink-0',
  default: 'size-4 shrink-0',
  lg: 'size-4 shrink-0',
} as const satisfies Record<AiButtonSize, string>;
const AI_BUTTON_CLICK_LOCK_MS = 5_000;
const AI_HOVER_PROPS = getAiGradientHoverProps<HTMLButtonElement>();

const toNonBreakingLabel = (label: string) => {
  return label.replaceAll('-', '\u2011').replaceAll(' ', '\u00A0');
};

type AiButtonProps = Omit<
  React.ComponentProps<'button'>,
  'children' | 'disabled'
> & {
  label: string;
  size?: AiButtonSize;
  isLoading?: boolean;
  isDisabled?: boolean;
  disabledTooltip?: React.ReactNode;
  enabledTooltip?: React.ReactNode;
  tooltipSide?: React.ComponentProps<typeof TooltipWrapper>['side'];
  tooltipAlign?: React.ComponentProps<typeof TooltipWrapper>['align'];
  tooltipClassName?: string;
  tooltipArrowClassName?: string;
};

/**
 * Renders the shared AI action button and temporarily locks repeated clicks
 * until external loading state can take over.
 *
 * @param props Button label, tooltip content, loading/disabled state, and
 * native button props.
 * @returns The AI button wrapped in the shared tooltip surface.
 */
export function AiButton(props: AiButtonProps) {
  const {
    label,
    size = 'default',
    isLoading = false,
    isDisabled = false,
    disabledTooltip,
    enabledTooltip,
    tooltipSide,
    tooltipAlign,
    tooltipClassName,
    tooltipArrowClassName,
    className,
    type = 'button',
    style,
    onClick,
    onPointerEnter,
    onPointerLeave,
    onFocus,
    onBlur,
    ...restProps
  } = props;
  const [isTemporarilyLocked, setIsTemporarilyLocked] = useState(false);
  const lockTimeoutRef = useRef<number | null>(null);
  const isClickLockedRef = useRef(false);

  // Clean up the pending unlock timeout when the button unmounts.
  // eslint-disable-next-line no-restricted-syntax -- the temporary click lock uses a window timeout that must be cleared if the button unmounts before the lock expires
  useEffect(() => {
    return () => {
      if (lockTimeoutRef.current !== null) {
        window.clearTimeout(lockTimeoutRef.current);
      }
    };
  }, []);

  const startTemporaryClickLock = () => {
    isClickLockedRef.current = true;
    setIsTemporarilyLocked(true);

    if (lockTimeoutRef.current !== null) {
      window.clearTimeout(lockTimeoutRef.current);
    }

    lockTimeoutRef.current = window.setTimeout(() => {
      isClickLockedRef.current = false;
      setIsTemporarilyLocked(false);
      lockTimeoutRef.current = null;
    }, AI_BUTTON_CLICK_LOCK_MS);
  };

  const isEffectivelyLoading = isLoading || isTemporarilyLocked;
  const isEffectivelyDisabled = isDisabled || isLoading || isTemporarilyLocked;
  const tooltipContent = isEffectivelyDisabled
    ? disabledTooltip
    : enabledTooltip;
  const button = (
    <span className="inline-flex">
      <button
        type={type}
        disabled={isEffectivelyDisabled}
        aria-label={label}
        aria-busy={isEffectivelyLoading}
        className={cn(
          'focus-ring inline-flex cursor-pointer items-center justify-center gap-1 border border-transparent font-medium tracking-[0.22px] whitespace-nowrap disabled:pointer-events-none',
          'shadow-[0px_4px_16px_0px_rgba(2,6,23,0.1),0px_2px_4px_0px_rgba(2,6,23,0.1),inset_0px_-4px_8px_0px_rgba(2,6,23,0.05)]',
          AI_BUTTON_SIZE_CLASSES[size],
          isEffectivelyDisabled ? 'cursor-default' : 'cursor-pointer',
          className,
        )}
        style={{ ...style, background: AI_SPARKLES_CHIP_BACKGROUND }}
        onPointerEnter={(event) => {
          if (!isEffectivelyDisabled) {
            AI_HOVER_PROPS.onPointerEnter(event);
          }
          onPointerEnter?.(event);
        }}
        onPointerLeave={(event) => {
          AI_HOVER_PROPS.onPointerLeave(event);
          onPointerLeave?.(event);
        }}
        onFocus={(event) => {
          if (!isEffectivelyDisabled) {
            AI_HOVER_PROPS.onFocus(event);
          }
          onFocus?.(event);
        }}
        onBlur={(event) => {
          AI_HOVER_PROPS.onBlur(event);
          onBlur?.(event);
        }}
        onClick={(event) => {
          if (isDisabled || isLoading || isClickLockedRef.current) {
            event.preventDefault();
            return;
          }

          startTemporaryClickLock();
          onClick?.(event);
        }}
        {...restProps}
      >
        {isEffectivelyLoading ? (
          <LoaderCircle
            className={cn('animate-spin', AI_BUTTON_ICON_SIZE_CLASSES[size])}
            style={{
              color: isEffectivelyDisabled
                ? 'var(--effect-gradient-ai-text-icon-disabled)'
                : 'var(--effect-gradient-ai-text-icon-primary)',
            }}
            aria-hidden="true"
          />
        ) : (
          <AiSparklesIcon
            className={AI_BUTTON_ICON_SIZE_CLASSES[size]}
            disabled={isEffectivelyDisabled}
          />
        )}
        <span
          className="bg-clip-text text-transparent"
          style={{
            backgroundImage: isEffectivelyDisabled
              ? 'none'
              : 'linear-gradient(180deg, var(--effect-gradient-ai-text-icon-primary) 0%, var(--effect-gradient-ai-text-icon-secondary) 100%)',
            color: isEffectivelyDisabled
              ? 'var(--effect-gradient-ai-text-icon-disabled)'
              : undefined,
          }}
        >
          {toNonBreakingLabel(label)}
        </span>
      </button>
    </span>
  );

  return (
    <TooltipWrapper
      content={tooltipContent}
      side={tooltipSide}
      align={tooltipAlign}
      className={tooltipClassName}
      arrowClassName={tooltipArrowClassName}
    >
      {button}
    </TooltipWrapper>
  );
}
