import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/features/ui/tooltip/Tooltip';
import { cn } from '@/features/ui/style/cn';
import { useLayoutEffect, useRef, useState } from 'react';

type MiddleTruncateProps = {
  text: string;
  /** Number of trailing characters that must always stay visible. */
  suffixLength?: number;
  className?: string;
};

const DEFAULT_SUFFIX_LENGTH = 10;
/**
 * Labels at or below this length virtually never overflow the row containers
 * this component is used in, so we can skip ResizeObserver-based measurement
 * for the common short-filename case.
 */
const SHORT_TEXT_THRESHOLD = 24;

export const MiddleTruncate = (props: MiddleTruncateProps) => {
  const { text, suffixLength = DEFAULT_SUFFIX_LENGTH, className } = props;
  const prefixRef = useRef<HTMLSpanElement | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const safeSuffixLength = Math.min(suffixLength, text.length);
  const splitIndex = text.length - safeSuffixLength;
  const prefix = text.slice(0, splitIndex);
  const suffix = text.slice(splitIndex);

  const isShortEnoughToSkipMeasurement = text.length <= SHORT_TEXT_THRESHOLD;

  useLayoutEffect(() => {
    // Short labels are virtually guaranteed to fit; skip measurement to avoid
    // the ResizeObserver/layout-read cost on the common case.
    if (isShortEnoughToSkipMeasurement) {
      return;
    }

    const element = prefixRef.current;
    if (!element) {
      return;
    }

    // Measure rendered prefix width vs. available width to detect truncation.
    const updateOverflowState = () => {
      setIsOverflowing(element.scrollWidth > element.clientWidth);
    };

    updateOverflowState();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const resizeObserver = new ResizeObserver(updateOverflowState);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [prefix, isShortEnoughToSkipMeasurement]);

  const innerContent = (
    <>
      <span ref={prefixRef} className="min-w-0 truncate">
        {prefix}
      </span>
      <span className="shrink-0 whitespace-pre">{suffix}</span>
    </>
  );

  if (!isOverflowing) {
    return (
      <span className={cn('flex min-w-0', className)}>{innerContent}</span>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          {/* Make the truncated label keyboard-reachable so the tooltip with the full text
              is available without a pointer. */}
          <span
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- truncated label needs focus to expose the tooltip with the full filename to keyboard users.
            tabIndex={0}
            className={cn('focus-ring flex min-w-0 rounded', className)}
          >
            {innerContent}
          </span>
        </TooltipTrigger>
        <TooltipContent className="pointer-events-none max-w-[min(32rem,calc(100vw-2rem))] text-left break-words whitespace-normal">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
