import * as React from 'react';
import { Root as LabelRoot } from '@radix-ui/react-label';
import { cn } from '@/features/ui/style/cn';

function Label(props: React.ComponentProps<typeof LabelRoot>) {
  const { className, ...labelProps } = props;

  return (
    <LabelRoot
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-[11px] leading-[14px] font-medium tracking-[0.22px] text-text-secondary select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      {...labelProps}
    />
  );
}

export { Label };
