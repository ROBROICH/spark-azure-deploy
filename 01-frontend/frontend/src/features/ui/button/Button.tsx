import { cn } from '@/features/ui/style/cn';
import { Slot } from '@radix-ui/react-slot';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { LoaderCircle } from 'lucide-react';
import * as React from 'react';

const buttonVariants = cva(
  'focus-ring inline-flex cursor-pointer items-center justify-center gap-1 rounded-lg font-medium tracking-[0.22px] whitespace-nowrap transition-all disabled:pointer-events-none data-[loading=true]:pointer-events-none data-[loading=true]:opacity-100 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary:
          'bg-brand-950 text-white shadow-elevated hover:bg-brand-800 active:bg-brand-800 disabled:text-neutral-400',
        secondary:
          'border-[0.5px] border-neutral-400 bg-white text-neutral-600 shadow-elevated hover:bg-neutral-100 hover:text-brand-950 active:bg-neutral-100 active:text-brand-950 disabled:border-neutral-300 disabled:text-neutral-400',
        danger:
          'bg-error-800 text-white shadow-elevated hover:bg-error-900 active:bg-error-900 disabled:text-neutral-400',
        ghost:
          'bg-transparent text-neutral-600 hover:bg-neutral-100 hover:text-brand-950 active:bg-neutral-100 active:text-brand-950 disabled:text-neutral-400',
        // ghost-light is used for icon buttons on non-white surfaces (e.g. card headers)
        // where a background change on hover would clash with the surface color.
        'ghost-light':
          'bg-transparent text-neutral-600 hover:text-neutral-900 active:text-neutral-900 disabled:text-neutral-400',
      },
      size: {
        xs: 'h-6 px-1.5 py-1 text-[11px] leading-[14px]',
        sm: 'h-8 px-3 py-1 text-[11px] leading-[14px]',
        md: 'h-9 px-3 text-sm',
        default: 'h-9 px-3 py-[9px] text-[11px] leading-[14px]',
        lg: 'h-11 px-4 text-base',
      },
      withIcon: {
        true: 'pl-1',
        false: '',
      },
      iconOnly: {
        true: 'aspect-square px-0',
        false: '',
      },
    },
    compoundVariants: [
      { size: 'xs', iconOnly: true, class: 'w-6' },
      { size: 'sm', iconOnly: true, class: 'w-8' },
      { size: 'md', iconOnly: true, class: 'w-9' },
      { size: 'default', iconOnly: true, class: 'w-9' },
      { size: 'lg', iconOnly: true, class: 'w-11' },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'default',
      withIcon: false,
      iconOnly: false,
    },
  },
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

type BaseButtonProps = React.ComponentProps<'button'> &
  Omit<ButtonVariantProps, 'iconOnly'> & {
    asChild?: boolean;
    loading?: boolean;
  };

export type ButtonProps = BaseButtonProps &
  (
    | { iconOnly: true; 'aria-label': string }
    | { iconOnly?: false; 'aria-label'?: string }
  );

/**
 * Renders the new design-system button with optional icon, loading, and slotted
 * child behavior.
 *
 * @param props Native button props plus design-system variants and loading state.
 * @returns A styled button or slotted child element.
 */
function Button(props: ButtonProps) {
  const {
    className,
    variant,
    size,
    withIcon,
    iconOnly = false,
    asChild = false,
    loading = false,
    children,
    disabled,
    ...rest
  } = props;
  const Comp = asChild ? Slot : 'button';

  const spinner = <LoaderCircle className="animate-spin" aria-hidden="true" />;

  const content = (() => {
    if (asChild) {
      return children;
    }

    if (loading && iconOnly) {
      return spinner;
    }

    if (loading && withIcon) {
      const [, ...remaining] = React.Children.toArray(children);
      return (
        <>
          <span className="flex items-center rounded-sm p-1">{spinner}</span>
          {remaining.length > 0 ? remaining : children}
        </>
      );
    }

    if (loading) {
      return (
        <>
          {spinner}
          {children}
        </>
      );
    }

    if (withIcon) {
      const [first, ...remaining] = React.Children.toArray(children);
      return (
        <>
          <span className="flex items-center rounded-sm p-1">{first}</span>
          {remaining}
        </>
      );
    }

    return children;
  })();

  return (
    <Comp
      data-slot="button"
      data-loading={loading}
      aria-busy={loading}
      className={cn(
        buttonVariants({ variant, size, withIcon, iconOnly, className }),
      )}
      {...rest}
      disabled={loading || disabled}
    >
      {content}
    </Comp>
  );
}

export { Button, buttonVariants };
