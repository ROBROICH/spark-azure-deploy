import { cn } from '@/features/ui/style/cn';
import { Slot } from '@radix-ui/react-slot';
import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';
import { CheckCircle2, Zap } from 'lucide-react';
import * as React from 'react';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;
type BadgeSize = NonNullable<VariantProps<typeof badgeVariants>['size']>;
type CustomBadgeConfig = {
  variant: BadgeVariant;
  Icon: React.ElementType;
};

type BadgeBaseProps = React.ComponentProps<'span'> & {
  asChild?: boolean;
};
type BadgeDefaultProps = VariantProps<typeof badgeVariants> & {
  type?: 'default';
  variant: BadgeVariant;
  size?: BadgeSize;
};
type CustomBadgeProps = {
  type: CustomBadgeType;
  variant?: never;
  size?: BadgeSize;
};
type BadgeProps = BadgeBaseProps & (BadgeDefaultProps | CustomBadgeProps);

// You can add custom badge types here
const customBadges = {
  ai: { variant: 'ai', Icon: Zap },
  success: { variant: 'success', Icon: CheckCircle2 },
} as const satisfies Record<string, CustomBadgeConfig>;
type CustomBadgeType = keyof typeof customBadges;

const badgeVariants = cva(
  'focus-ring inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md leading-5 whitespace-nowrap transition-[color,box-shadow] aria-invalid:border-destructive aria-invalid:ring-destructive dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none',
  {
    variants: {
      size: {
        medium: 'text-body-s px-3 py-1 [&>svg]:size-4',
        small: 'text-body-s px-2 py-0.5 [&>svg]:size-4',
      },
      variant: {
        primary: 'bg-highlight-brand text-text-clickable',
        secondary: 'bg-highlight-inactive text-text-secondary',
        success: 'bg-highlight-success text-text-success',
        neutral: 'bg-neutral-white text-text-secondary',
        ai: 'bg-highlight-ki text-text-ki',
        warningOrange: 'bg-highlight-warning text-text-error',
        warningSoft: 'bg-orange-50 text-red-900',
        error: 'bg-rose-200 text-text-error',
        warningYellow: 'bg-highlight-alarm text-text-error',
        riskHigh: 'border-[0.5px] border-red-600 bg-red-50 text-red-900',
        riskMedium:
          'border-[0.5px] border-orange-500 bg-orange-50 text-orange-900',
        riskLow: 'border-[0.5px] border-green-600 bg-green-50 text-green-900',
      },
    },
    defaultVariants: {
      size: 'medium',
    },
  },
);

function Badge({
  className,
  asChild = false,
  type = 'default',
  variant,
  size,
  children,
  ...props
}: BadgeProps) {
  const isDefaultType = type === 'default';
  const resolvedVariant = isDefaultType ? variant : customBadges[type].variant;
  const IconComp = isDefaultType ? null : customBadges[type].Icon;

  if (asChild) {
    return (
      <Slot
        data-slot="badge"
        className={cn(
          badgeVariants({ variant: resolvedVariant, size }),
          className,
        )}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <span
      data-slot="badge"
      className={cn(
        badgeVariants({ variant: resolvedVariant, size }),
        className,
      )}
      {...props}
    >
      {IconComp ? <IconComp aria-hidden="true" focusable="false" /> : null}
      {children}
    </span>
  );
}

export { Badge };
