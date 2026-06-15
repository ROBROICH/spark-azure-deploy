import {
  Content as TabsContentPrimitive,
  List as TabsListPrimitive,
  Root as TabsRoot,
  Trigger as TabsTriggerPrimitive,
} from '@radix-ui/react-tabs';
import * as React from 'react';

import { cn } from '@/features/ui/style/cn';

function Tabs(props: React.ComponentProps<typeof TabsRoot>) {
  const { className, ...tabsProps } = props;

  return (
    <TabsRoot
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...tabsProps}
    />
  );
}

function TabsList(props: React.ComponentProps<typeof TabsListPrimitive>) {
  const { className, ...tabsListProps } = props;

  return (
    <TabsListPrimitive
      data-slot="tabs-list"
      className={cn(
        'inline-flex h-auto items-center gap-0 rounded-none bg-transparent p-0',
        className,
      )}
      {...tabsListProps}
    />
  );
}

type TabsTriggerProps = React.ComponentProps<typeof TabsTriggerPrimitive> & {
  variant?: 'default' | 'segmented';
};

function TabsTrigger(props: TabsTriggerProps) {
  const { className, variant = 'default', ...tabsTriggerProps } = props;

  return (
    <TabsTriggerPrimitive
      data-slot="tabs-trigger"
      className={cn(
        'focus-ring cursor-pointer font-medium transition-[color,box-shadow] focus-visible:rounded-[5px] disabled:pointer-events-none disabled:opacity-100 data-[state=active]:cursor-default',
        variant === 'default' &&
          'rounded-none border-b border-transparent px-5 py-[15px] text-[13px] leading-[18px] tracking-[-0.13px] text-[#475569] hover:text-[#1E1D49] disabled:text-[#64748B] data-[state=active]:border-[#1E1D49] data-[state=active]:text-[#1E1D49]',
        variant === 'segmented' &&
          'flex-1 border border-slate-300 bg-transparent px-2 py-[5px] text-[11px] leading-[14px] whitespace-nowrap text-slate-700 first:rounded-l-[4px] last:rounded-r-[4px] hover:text-slate-700 focus-visible:bg-transparent data-[state=active]:border-slate-300 data-[state=active]:bg-slate-300 data-[state=active]:text-brand-950',
        className,
      )}
      {...tabsTriggerProps}
    />
  );
}

function TabsContent(props: React.ComponentProps<typeof TabsContentPrimitive>) {
  const { className, ...tabsContentProps } = props;

  return (
    <TabsContentPrimitive
      data-slot="tabs-content"
      className={cn('flex min-h-0 flex-1 flex-col outline-none', className)}
      {...tabsContentProps}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
