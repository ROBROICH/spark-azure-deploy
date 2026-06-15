import * as React from 'react';

import { cn } from '@/features/ui/style/cn';

function Textarea(props: React.ComponentProps<'textarea'>) {
  const { className, ...rest } = props;

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'focus-ring flex field-sizing-content min-h-16 w-full min-w-0 rounded-md border border-border-form bg-transparent px-3 py-2 text-base text-brand-950 shadow-xs transition-[color,box-shadow] outline-none placeholder:text-text-secondary disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border-tertiary disabled:bg-bg-tertiary disabled:text-neutral-500 aria-invalid:border-error-800 aria-invalid:ring-2 aria-invalid:ring-error-800 aria-invalid:ring-offset-1 md:text-sm',
        className,
      )}
      {...rest}
    />
  );
}

export { Textarea };
