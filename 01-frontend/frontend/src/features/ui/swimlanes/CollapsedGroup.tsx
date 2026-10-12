import { Content as TabsContent } from '@radix-ui/react-tabs';
import { type ElementType, type ReactNode } from 'react';

import { cn } from '@/features/ui/style/cn';

import { SwimlaneTabs } from '../swimlane-tabs/SwimlaneTabs';

type LaneMeta = {
  id: string;
  title: string;
  icon: ElementType;
  action?: ReactNode;
  children?: ReactNode;
};

type CollapsedGroupProps = {
  laneMetas: LaneMeta[];
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel?: string;
};

export const CollapsedGroup = (props: CollapsedGroupProps) => {
  const { laneMetas, value, onValueChange, ariaLabel } = props;

  const tabItems = laneMetas.map((meta) => ({
    value: meta.id,
    label: meta.title,
    icon: meta.icon,
    action: meta.action,
  }));

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-[var(--swimlane-min-w)] flex-1 flex-col bg-white',
      )}
    >
      <SwimlaneTabs
        items={tabItems}
        value={value}
        onValueChange={onValueChange}
        ariaLabel={ariaLabel}
      >
        {laneMetas.map((meta) => (
          <TabsContent
            key={meta.id}
            value={meta.id}
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          >
            {meta.children}
          </TabsContent>
        ))}
      </SwimlaneTabs>
    </div>
  );
};

export type { CollapsedGroupProps, LaneMeta };
