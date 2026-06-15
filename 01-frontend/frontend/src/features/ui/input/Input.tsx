import * as React from 'react';

import { cn } from '@/features/ui/style/cn';

function Input(props: React.ComponentProps<'input'>) {
  const { className, type, ...rest } = props;

  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'focus-ring h-9 w-full min-w-0 rounded-md border border-border-form bg-transparent px-3 py-1 text-brand-950 shadow-xs transition-[color,box-shadow] outline-none',
        'file:text-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'selection:bg-primary selection:text-primary-foreground',
        'placeholder:text-text-secondary md:text-sm',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border-tertiary disabled:bg-bg-tertiary disabled:text-neutral-500',
        'aria-invalid:border-error-800 aria-invalid:ring-2 aria-invalid:ring-error-800 aria-invalid:ring-offset-1',
        className,
      )}
      {...rest}
    />
  );
}

type InputProps = React.ComponentProps<'input'>;

export { Input };
export type { InputProps };
