import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/features/ui/tooltip/Tooltip';
import { cn } from '@/features/ui/style/cn';
import { useSidebar } from './sidebar-context';

const sidebarMenuButtonVariants = cva(
  'peer/menu-button focus-ring flex min-h-8 w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-sm leading-[18px] font-medium text-slate-600 transition-[width,height,background-color,color,box-shadow,gap,margin] duration-200 ease-linear group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:gap-0 group-data-[side=left]:group-data-[collapsible=icon]:mr-auto group-data-[side=right]:group-data-[collapsible=icon]:mx-auto group-data-[theme=dark]:rounded-lg group-data-[theme=dark]:text-slate-300 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-neutral-white data-[active=true]:text-slate-900 data-[active=true]:shadow-sm group-data-[theme=dark]:data-[active=true]:bg-slate-500 group-data-[theme=dark]:data-[active=true]:text-white group-data-[theme=dark]:data-[active=true]:shadow-[0px_2px_4px_0px_rgba(2,6,23,0.1),0px_4px_16px_0px_rgba(2,6,23,0.1)] [&_[data-sidebar=label]]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'hover:bg-neutral-white/70 hover:text-slate-900 group-data-[theme=dark]:hover:bg-slate-700/70 group-data-[theme=dark]:hover:text-white',
        outline:
          'bg-neutral-white ring-1 ring-slate-200 group-data-[theme=dark]:bg-slate-700 group-data-[theme=dark]:ring-slate-300/40 hover:bg-neutral-white hover:ring-slate-300 group-data-[theme=dark]:hover:bg-slate-700 group-data-[theme=dark]:hover:ring-slate-300/50',
      },
      color: {
        default: '',
        ai: 'text-violet-800 hover:bg-neutral-white/70 hover:text-violet-900 data-[active=true]:bg-neutral-white data-[active=true]:text-violet-950 data-[active=true]:shadow-sm [&>svg]:stroke-[1.25] [&>svg]:text-violet-700',
      },
      size: {
        default: '',
        sm: 'h-7 text-xs',
        lg: 'min-h-10 text-sm',
      },
    },
    defaultVariants: {
      variant: 'default',
      color: 'default',
      size: 'default',
    },
  },
);

export type SidebarMenuButtonVariantProps = VariantProps<
  typeof sidebarMenuButtonVariants
>;

export type SidebarMenuTooltipProps =
  | string
  | React.ComponentProps<typeof TooltipContent>;

/**
 * Renders the shared sidebar button primitive and keeps tooltip behavior aligned
 * with the current collapsed sidebar state on either screen edge.
 */
export function SidebarMenuButton(
  props: React.ComponentProps<'button'> & {
    asChild?: boolean;
    isActive?: boolean;
    tooltip?: SidebarMenuTooltipProps;
  } & SidebarMenuButtonVariantProps,
) {
  const {
    asChild = false,
    children,
    isActive = false,
    variant = 'default',
    color = 'default',
    size = 'default',
    tooltip,
    className,
    ...restProps
  } = props;
  const Comp = asChild ? Slot : 'button';
  const { isMobile, state } = useSidebar();
  const [tooltipSide, setTooltipSide] = React.useState<
    'left' | 'right' | 'top' | 'bottom'
  >('right');

  const tooltipProps =
    typeof tooltip === 'string' ? { children: tooltip } : tooltip;
  const shouldShowTooltip =
    Boolean(tooltipProps) && state === 'collapsed' && !isMobile;

  const updateTooltipSide = (currentTarget: EventTarget | null) => {
    if (!shouldShowTooltip || !(currentTarget instanceof HTMLElement)) {
      return;
    }

    const nextTooltipSide =
      currentTarget
        .closest('[data-slot="sidebar"]')
        ?.getAttribute('data-side') === 'right'
        ? 'left'
        : 'right';

    setTooltipSide((currentTooltipSide) =>
      currentTooltipSide === nextTooltipSide
        ? currentTooltipSide
        : nextTooltipSide,
    );
  };

  const handlePointerEnter: React.PointerEventHandler<HTMLElement> = (
    event,
  ) => {
    updateTooltipSide(event.currentTarget);
    restProps.onPointerEnter?.(event as React.PointerEvent<HTMLButtonElement>);
  };

  const handleFocus: React.FocusEventHandler<HTMLElement> = (event) => {
    updateTooltipSide(event.currentTarget);
    restProps.onFocus?.(event as React.FocusEvent<HTMLButtonElement>);
  };

  const button = (
    <Comp
      data-slot="sidebar-menu-button"
      data-sidebar="menu-button"
      data-size={size}
      data-active={isActive}
      data-color={color}
      onPointerEnter={handlePointerEnter}
      onFocus={handleFocus}
      className={cn(
        sidebarMenuButtonVariants({ variant, color, size }),
        className,
      )}
      {...restProps}
    >
      {children}
    </Comp>
  );

  if (!tooltip) {
    return button;
  }

  if (!tooltipProps) {
    return button;
  }

  const resolvedTooltipProps = tooltipProps;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent
        {...resolvedTooltipProps}
        side={resolvedTooltipProps.side ?? tooltipSide}
        align="center"
        hidden={state !== 'collapsed' || isMobile}
        className={resolvedTooltipProps.className}
      />
    </Tooltip>
  );
}
