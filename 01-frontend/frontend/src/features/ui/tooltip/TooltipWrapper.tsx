import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/features/ui/tooltip/Tooltip';
import { cn } from '@/features/ui/style/cn';
import * as React from 'react';

type TooltipWrapperProps = {
  content?: React.ReactNode;
  children: React.ReactElement<
    React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>
  >;
  side?: React.ComponentProps<typeof TooltipContent>['side'];
  align?: React.ComponentProps<typeof TooltipContent>['align'];
  sideOffset?: React.ComponentProps<typeof TooltipContent>['sideOffset'];
  ariaLabel?: string;
  className?: string;
  arrowClassName?: string;
  interactive?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onlyWhenOverflowing?: boolean;
  triggerMode?: 'hover' | 'click';
};

/**
 * Tooltip behaviour wrapper — adds hover/click/overflow tooltip to any focusable child.
 * No visual output of its own; the child IS the trigger.
 */
export function TooltipWrapper(props: TooltipWrapperProps) {
  const {
    content,
    children,
    side = 'top',
    align,
    sideOffset,
    ariaLabel,
    className,
    arrowClassName,
    interactive = false,
    open: controlledOpen,
    onOpenChange,
    onlyWhenOverflowing = false,
    triggerMode = 'hover',
  } = props;
  const elementRef = React.useRef<HTMLElement | null>(null);
  const [isOverflowing, setIsOverflowing] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);

  React.useLayoutEffect(() => {
    if (!onlyWhenOverflowing) {
      return;
    }

    const element = elementRef.current;

    if (!element) {
      return;
    }

    const updateOverflowState = () => {
      setIsOverflowing(element.scrollWidth > element.clientWidth);
    };

    updateOverflowState();

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const resizeObserver = new ResizeObserver(() => {
      updateOverflowState();
    });

    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [content, onlyWhenOverflowing]);

  if (content === undefined || content === null) {
    return <>{children}</>;
  }

  if (!onlyWhenOverflowing) {
    const isClickTriggered = triggerMode === 'click';
    const clickOpen = controlledOpen ?? uncontrolledOpen;
    const setClickOpen = (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    };
    const childProps = children.props;
    const handleClick: React.MouseEventHandler<HTMLElement> | undefined =
      isClickTriggered
        ? (event) => {
            childProps.onClick?.(event);

            if (event.defaultPrevented) {
              return;
            }

            if (event.detail === 0) {
              return;
            }

            setClickOpen(!clickOpen);
          }
        : undefined;
    const handleKeyDown: React.KeyboardEventHandler<HTMLElement> | undefined =
      isClickTriggered
        ? (event) => {
            childProps.onKeyDown?.(event);

            if (
              event.defaultPrevented ||
              (event.key !== 'Enter' && event.key !== ' ')
            ) {
              return;
            }

            event.preventDefault();
            setClickOpen(!clickOpen);
          }
        : undefined;
    const handleBlur: React.FocusEventHandler<HTMLElement> | undefined =
      isClickTriggered && interactive
        ? (event) => {
            childProps.onBlur?.(event);
            event.preventDefault();
          }
        : undefined;

    return (
      <TooltipProvider>
        <Tooltip
          open={isClickTriggered ? clickOpen : controlledOpen}
          onOpenChange={isClickTriggered ? setClickOpen : onOpenChange}
          disableHoverableContent={!interactive}
        >
          <TooltipTrigger asChild>
            {isClickTriggered
              ? React.cloneElement(children, {
                  onClick: handleClick,
                  onKeyDown: handleKeyDown,
                  onBlur: handleBlur,
                })
              : children}
          </TooltipTrigger>
          <TooltipContent
            side={side}
            align={align}
            sideOffset={sideOffset}
            aria-label={ariaLabel}
            className={cn(
              interactive ? 'pointer-events-auto' : 'pointer-events-none',
              className,
            )}
            arrowClassName={arrowClassName}
          >
            {content}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

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
    <TooltipProvider>
      <Tooltip
        open={open}
        onOpenChange={(nextOpen) => {
          setIsOpen(nextOpen && isOverflowing);
        }}
        disableHoverableContent={true}
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
          align={align}
          sideOffset={sideOffset}
          aria-label={ariaLabel}
          className={cn('pointer-events-none', className)}
          arrowClassName={arrowClassName}
        >
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
