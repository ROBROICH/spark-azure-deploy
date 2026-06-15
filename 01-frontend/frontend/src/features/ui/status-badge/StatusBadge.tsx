import { cn } from '@/features/ui/style/cn';
import { X } from 'lucide-react';
import type * as React from 'react';

export type StatusBadgeVariant =
  | 'default'
  | 'neutral'
  | 'success'
  | 'warning'
  | 'error';
export type StatusBadgeSize = 'default' | 'sm';

const VARIANT_CLASSES = {
  default: 'border-border-tertiary bg-neutral-white text-text-secondary',
  neutral: 'border-primary-600 bg-primary-50 text-primary-900',
  success: 'border-border-success bg-green-50 text-text-success',
  warning: 'border-border-warning bg-highlight-warning-light text-text-warning',
  error: 'border-border-error bg-highlight-error text-text-error',
} satisfies Record<StatusBadgeVariant, string>;

const SIZE_CLASSES = {
  default: 'h-6 text-[11px] leading-[14px]',
  sm: 'h-[18px] text-[10px] leading-none',
} satisfies Record<StatusBadgeSize, string>;

const CONTENT_PADDING_CLASSES = {
  default: 'px-2',
  sm: 'px-1.5',
} satisfies Record<StatusBadgeSize, string>;

const REMOVE_BUTTON_CLASSES = {
  default: 'size-6',
  sm: 'size-[18px]',
} satisfies Record<StatusBadgeSize, string>;

type StatusBadgeBaseProps = Omit<React.ComponentProps<'span'>, 'children'> & {
  children: React.ReactNode;
  variant?: StatusBadgeVariant;
  size?: StatusBadgeSize;
};

type StatusBadgeProps = StatusBadgeBaseProps &
  (
    | {
        onRemove: () => void;
        removeLabel: string;
      }
    | {
        onRemove?: undefined;
        removeLabel?: string;
      }
  );

export function StatusBadge(props: StatusBadgeProps) {
  const {
    variant = 'default',
    size = 'default',
    className,
    children,
    onRemove,
    removeLabel,
    ...rest
  } = props;

  return (
    <span
      className={cn(
        'inline-flex w-fit shrink-0 items-center rounded-sm border-[0.5px] font-medium whitespace-nowrap',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...rest}
    >
      <span className={CONTENT_PADDING_CLASSES[size]}>{children}</span>
      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className={cn(
            'focus-ring flex shrink-0 items-center justify-center border-l-[0.5px] border-current hover:bg-black/5',
            REMOVE_BUTTON_CLASSES[size],
          )}
        >
          <X aria-hidden className="size-3" />
        </button>
      ) : null}
    </span>
  );
}
