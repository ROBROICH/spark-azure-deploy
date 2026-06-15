'use client';

import { Root as SeparatorRoot } from '@radix-ui/react-separator';
import * as React from 'react';

import { cn } from '@/features/ui/style/cn';

function Separator(props: React.ComponentProps<typeof SeparatorRoot>) {
  const {
    className,
    orientation = 'horizontal',
    decorative = true,
    ...separatorProps
  } = props;

  return (
    <SeparatorRoot
      data-slot="separator"
      decorative={decorative}
      orientation={orientation}
      className={cn(
        'bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className,
      )}
      {...separatorProps}
    />
  );
}

export { Separator };
