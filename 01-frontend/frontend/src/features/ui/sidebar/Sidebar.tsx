import * as React from 'react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/features/ui/sheet/Sheet';
import { TooltipProvider } from '@/features/ui/tooltip/Tooltip';
import { cn } from '@/features/ui/style/cn';
import {
  SidebarBrand,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarSeparator,
} from './sidebar-layout-primitives';
import { SidebarMenuButton } from './sidebar-menu-primitives';
import { SidebarMenuLinkButton } from './SidebarMenuLinkButton';
import {
  SidebarContext,
  useSidebar,
  useSidebarContextValue,
} from './sidebar-context';

const SIDEBAR_WIDTH = '16rem';
const SIDEBAR_WIDTH_MOBILE = '16rem';
const SIDEBAR_WIDTH_ICON = '3rem';
type SidebarTheme = 'default' | 'dark';

/** Context provider that manages sidebar open/collapsed state, mobile detection, and keyboard shortcut (Cmd+B). */
function SidebarProvider({
  defaultOpen = false,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}: React.ComponentProps<'div'> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const contextValue = useSidebarContextValue({
    defaultOpen,
    open: openProp,
    onOpenChange: setOpenProp,
  });

  return (
    <SidebarContext.Provider value={contextValue}>
      <TooltipProvider delayDuration={0}>
        <div
          data-slot="sidebar-wrapper"
          style={
            {
              '--sidebar-width': SIDEBAR_WIDTH,
              '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
              ...style,
            } as React.CSSProperties
          }
          className={cn('group/sidebar-wrapper flex min-h-0 w-full', className)}
          {...props}
        >
          {children}
        </div>
      </TooltipProvider>
    </SidebarContext.Provider>
  );
}

/** Main sidebar shell — renders as a fixed panel on desktop or a Sheet drawer on mobile, with collapsible icon mode. */
function Sidebar(
  props: React.ComponentProps<'div'> & {
    side?: 'left' | 'right';
    variant?: 'sidebar' | 'floating' | 'inset';
    collapsible?: 'offcanvas' | 'icon' | 'none';
    expandDirection?: 'left-to-right' | 'right-to-left';
    theme?: SidebarTheme;
  },
) {
  const {
    side = 'left',
    variant = 'sidebar',
    collapsible = 'offcanvas',
    expandDirection,
    theme = 'default',
    className,
    children,
    ...restProps
  } = props;
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
  const desktopAnchorSide =
    expandDirection === 'left-to-right'
      ? 'left'
      : expandDirection === 'right-to-left'
        ? 'right'
        : side;

  if (collapsible === 'none') {
    return (
      <nav
        data-slot="sidebar"
        data-theme={theme}
        className={cn(
          'group flex h-full w-(--sidebar-width) flex-col border-r border-slate-200 bg-slate-100 text-text-primary',
          'data-[theme=dark]:border-slate-600 data-[theme=dark]:bg-slate-800 data-[theme=dark]:text-slate-300',
          className,
        )}
        {...restProps}
      >
        {children}
      </nav>
    );
  }

  if (isMobile) {
    const { 'aria-label': ariaLabel, id, ...sheetRestProps } = restProps;
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...sheetRestProps}>
        <SheetContent
          id={id}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          data-theme={theme}
          className="group w-(--sidebar-width) border-r border-slate-200 bg-slate-100 p-0 text-text-primary data-[theme=dark]:border-slate-600 data-[theme=dark]:bg-slate-800 data-[theme=dark]:text-slate-300 [&>button]:hidden"
          style={
            {
              '--sidebar-width': SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <nav aria-label={ariaLabel} className="flex h-full w-full flex-col">
            {children}
          </nav>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div
      className="group peer z-20 hidden text-text-primary data-[theme=dark]:text-slate-300 md:block"
      data-state={state}
      data-collapsible={state === 'collapsed' ? collapsible : ''}
      data-variant={variant}
      data-side={side}
      data-expand-direction={expandDirection}
      data-slot="sidebar"
      data-theme={theme}
    >
      <div
        data-slot="sidebar-gap"
        className={cn(
          'relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear',
          'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
          'group-data-[collapsible=offcanvas]:w-0',
        )}
      />
      <nav
        data-slot="sidebar-container"
        className={cn(
          'fixed inset-y-0 z-30 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex',
          desktopAnchorSide === 'left'
            ? 'left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]'
            : 'right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]',
          variant === 'floating' || variant === 'inset'
            ? 'p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]'
            : 'group-data-[collapsible=icon]:w-(--sidebar-width-icon)',
          className,
        )}
        {...restProps}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className={cn(
            'flex h-full w-full flex-col bg-slate-100 group-data-[theme=dark]:bg-slate-800',
            desktopAnchorSide === 'left'
              ? 'border-r border-slate-200 group-data-[theme=dark]:border-slate-600'
              : 'border-l border-slate-200 group-data-[theme=dark]:border-slate-600',
          )}
        >
          {children}
        </div>
      </nav>
    </div>
  );
}

export {
  Sidebar,
  SidebarBrand,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuLinkButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarSeparator,
  useSidebar,
};
