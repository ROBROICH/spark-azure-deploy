import { Separator } from '@/features/ui/form/separator';
import { cn } from '@/features/ui/style/cn';
import { Slot } from '@radix-ui/react-slot';
import type * as React from 'react';

export function SidebarInset(props: React.ComponentProps<'div'>) {
  const { className, ...restProps } = props;

  return (
    <div
      data-slot="sidebar-inset"
      className={cn(
        'relative flex w-full flex-1 flex-col bg-bg-secondary',
        'md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-md md:peer-data-[variant=inset]:shadow-sm md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2',
        className,
      )}
      {...restProps}
    />
  );
}

export function SidebarHeader(props: React.ComponentProps<'div'>) {
  const { className, ...restProps } = props;

  return (
    <div
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn(
        'flex min-h-0 flex-col justify-center gap-1 overflow-hidden p-1',
        className,
      )}
      {...restProps}
    />
  );
}

export function SidebarBrand(props: React.ComponentProps<'div'>) {
  const { className, ...restProps } = props;

  return (
    <div
      data-slot="sidebar-brand"
      data-sidebar="brand"
      className={cn(
        'flex min-h-0 items-center overflow-hidden py-1 transition-[margin] duration-200 ease-linear group-data-[side=left]:group-data-[collapsible=icon]:mr-auto group-data-[side=right]:group-data-[collapsible=icon]:mx-auto',
        className,
      )}
      {...restProps}
    />
  );
}

export function SidebarLabel(props: React.ComponentProps<'span'>) {
  const { className, ...restProps } = props;

  return (
    <span
      data-slot="sidebar-label"
      data-sidebar="label"
      className={cn(
        'min-w-0 flex-1 truncate whitespace-nowrap transition-opacity duration-150 ease-linear',
        'group-data-[color=ai]:bg-linear-to-b group-data-[color=ai]:from-violet-600 group-data-[color=ai]:to-purple-900 group-data-[color=ai]:bg-clip-text group-data-[color=ai]:text-transparent',
        'group-data-[collapsible=icon]:pointer-events-none group-data-[collapsible=icon]:opacity-0',
        className,
      )}
      {...restProps}
    />
  );
}

export function SidebarFooter(props: React.ComponentProps<'div'>) {
  const { className, ...restProps } = props;

  return (
    <div
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn('flex flex-col gap-1 p-1', className)}
      {...restProps}
    />
  );
}

export function SidebarSeparator(
  props: React.ComponentProps<typeof Separator>,
) {
  const { className, ...restProps } = props;

  return (
    <Separator
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn(
        'mx-0 w-auto bg-border-secondary group-data-[theme=dark]:bg-slate-600',
        className,
      )}
      {...restProps}
    />
  );
}

export function SidebarContent(props: React.ComponentProps<'div'>) {
  const { className, ...restProps } = props;

  return (
    <div
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        'flex min-h-0 flex-1 flex-col gap-1 overflow-auto p-1 group-data-[collapsible=icon]:overflow-hidden',
        className,
      )}
      {...restProps}
    />
  );
}

export function SidebarGroup(props: React.ComponentProps<'div'>) {
  const { className, ...restProps } = props;

  return (
    <div
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn('relative flex w-full min-w-0 flex-col p-1', className)}
      {...restProps}
    />
  );
}

export function SidebarGroupLabel(
  props: React.ComponentProps<'div'> & { asChild?: boolean },
) {
  const { className, asChild = false, ...restProps } = props;
  const Comp = asChild ? Slot : 'div';

  return (
    <Comp
      data-slot="sidebar-group-label"
      data-sidebar="group-label"
      className={cn(
        'focus-ring flex h-6 shrink-0 items-center rounded-md px-2 text-[11px] font-medium tracking-[0.02em] text-text-secondary uppercase transition-[margin,opacity] duration-200 ease-linear [&>svg]:size-4 [&>svg]:shrink-0',
        'group-data-[theme=dark]:text-slate-400',
        'group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0',
        className,
      )}
      {...restProps}
    />
  );
}

export function SidebarGroupContent(props: React.ComponentProps<'div'>) {
  const { className, ...restProps } = props;

  return (
    <div
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn('w-full text-sm', className)}
      {...restProps}
    />
  );
}

export function SidebarMenu(props: React.ComponentProps<'ul'>) {
  const { className, ...restProps } = props;

  return (
    <ul
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn('flex w-full min-w-0 flex-col gap-1', className)}
      {...restProps}
    />
  );
}

export function SidebarMenuItem(props: React.ComponentProps<'li'>) {
  const { className, ...restProps } = props;

  return (
    <li
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn('group/menu-item relative', className)}
      {...restProps}
    />
  );
}
