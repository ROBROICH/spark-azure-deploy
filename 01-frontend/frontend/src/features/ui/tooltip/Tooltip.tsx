import {
  Arrow as TooltipArrow,
  Content as TooltipContentPrimitive,
  Portal as TooltipPortal,
  Provider as TooltipProviderPrimitive,
  Root as TooltipRoot,
  Trigger as TooltipTriggerPrimitive,
} from '@radix-ui/react-tooltip';
import * as React from 'react';

import { cn } from '@/features/ui/style/cn';

function TooltipProvider(
  props: React.ComponentProps<typeof TooltipProviderPrimitive>,
) {
  const { delayDuration = 0, ...tooltipProviderProps } = props;

  return (
    <TooltipProviderPrimitive
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...tooltipProviderProps}
    />
  );
}

function Tooltip(props: React.ComponentProps<typeof TooltipRoot>) {
  return <TooltipRoot data-slot="tooltip" {...props} />;
}

function TooltipTrigger(
  props: React.ComponentProps<typeof TooltipTriggerPrimitive>,
) {
  return <TooltipTriggerPrimitive data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent(
  props: React.ComponentProps<typeof TooltipContentPrimitive> & {
    arrowClassName?: string;
  },
) {
  const {
    className,
    arrowClassName,
    side = undefined, // undefined means auto
    sideOffset = 0,
    children,
    ...tooltipContentProps
  } = props;

  return (
    <TooltipPortal>
      <TooltipContentPrimitive
        data-slot="tooltip-content"
        side={side}
        sideOffset={sideOffset}
        avoidCollisions={true}
        collisionPadding={8}
        className={cn(
          'relative z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in rounded-[5px] bg-slate-800 px-2 py-1 text-[11px] leading-[14px] font-medium tracking-[0.02em] text-balance text-white shadow-elevated fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          className,
        )}
        {...tooltipContentProps}
      >
        {children}
        <TooltipArrow
          data-slot="tooltip-arrow"
          className={cn(
            'relative top-[-2px] z-0 size-[5px] rotate-45 bg-slate-800 fill-slate-800',
            arrowClassName,
          )}
        />
      </TooltipContentPrimitive>
    </TooltipPortal>
  );
}

type OverflowTooltipChildProps = React.HTMLAttributes<HTMLElement> & {
  ref?: React.Ref<HTMLElement>;
};

type OverflowTooltipProps = {
  children: React.ReactElement<OverflowTooltipChildProps>;
  content: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
};

function OverflowTooltip(props: OverflowTooltipProps) {
  const { children, content, side, delayDuration } = props;
  const elementRef = React.useRef<HTMLElement | null>(null);
  const [isOverflowing, setIsOverflowing] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);

  React.useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) {
      return;
    }

    const updateOverflowState = () => {
      setIsOverflowing(
        element.scrollWidth > element.clientWidth ||
          element.scrollHeight > element.clientHeight,
      );
    };

    updateOverflowState();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    // Overflow depends on rendered layout, so we observe the element size directly.
    const resizeObserver = new ResizeObserver(() => {
      updateOverflowState();
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [content]);

  const open = isOpen && isOverflowing;
  const handlePointerEnter: React.PointerEventHandler<HTMLElement> = () => {
    setIsOpen(isOverflowing);
  };

  const handlePointerLeave: React.PointerEventHandler<HTMLElement> = () => {
    setIsOpen(false);
  };

  const handleFocus: React.FocusEventHandler<HTMLElement> = () => {
    setIsOpen(isOverflowing);
  };

  const handleBlur: React.FocusEventHandler<HTMLElement> = () => {
    setIsOpen(false);
  };

  return (
    <Tooltip
      open={open}
      onOpenChange={(nextOpen) => {
        setIsOpen(nextOpen && isOverflowing);
      }}
      disableHoverableContent={true}
      delayDuration={delayDuration}
    >
      <TooltipTrigger
        asChild
        ref={(node) => {
          elementRef.current = node;
        }}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className="pointer-events-none max-w-[min(32rem,calc(100vw-2rem))] text-left break-words whitespace-normal"
      >
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

export {
  OverflowTooltip,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
};
