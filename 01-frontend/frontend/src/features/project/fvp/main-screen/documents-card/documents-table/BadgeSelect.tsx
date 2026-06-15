import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { StatusBadge } from '@/features/ui/status-badge/StatusBadge';
import { cn } from '@/features/ui/style/cn';
import { ChevronDown } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

export type BadgeSelectVariant = 'default' | 'neutral';

type BadgeSelectTriggerProps = ComponentProps<'button'> & {
  variant: BadgeSelectVariant;
  icon: ReactNode;
  label: ReactNode;
};

const BadgeSelectTrigger = (props: BadgeSelectTriggerProps) => {
  const {
    variant,
    icon,
    label,
    type = 'button',
    className,
    disabled,
    ...rest
  } = props;

  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'focus-ring inline-flex max-w-full cursor-pointer items-center gap-1 rounded-[4px] disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
      {...rest}
    >
      <StatusBadge variant={variant}>
        <span className="inline-flex items-center gap-1">
          <span className="inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-3.5">
            {icon}
          </span>
          <span className="block max-w-44 truncate text-left text-[11px] leading-[14px] font-medium tracking-[0.02em]">
            {label}
          </span>
        </span>
      </StatusBadge>
      <ChevronDown
        aria-hidden="true"
        className="size-4 shrink-0 text-text-secondary"
      />
    </button>
  );
};

type BadgeSelectProps = {
  variant: BadgeSelectVariant;
  icon: ReactNode;
  label: ReactNode;
  ariaLabel: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  align?: 'start' | 'center' | 'end';
  className?: string;
  contentClassName?: string;
  children: ReactNode;
};

export const BadgeSelect = (props: BadgeSelectProps) => {
  const {
    variant,
    icon,
    label,
    ariaLabel,
    open,
    onOpenChange,
    disabled = false,
    align = 'start',
    className,
    contentClassName,
    children,
  } = props;

  if (disabled) {
    return (
      <BadgeSelectTrigger
        variant={variant}
        icon={icon}
        label={label}
        aria-label={ariaLabel}
        disabled
        className={className}
      />
    );
  }

  return (
    <ActionMenu open={open} onOpenChange={onOpenChange}>
      <ActionMenuTrigger asChild>
        <BadgeSelectTrigger
          variant={variant}
          icon={icon}
          label={label}
          aria-label={ariaLabel}
          disabled={disabled}
          className={className}
        />
      </ActionMenuTrigger>
      <ActionMenuContent
        align={align}
        className={cn('min-w-56', contentClassName)}
      >
        {children}
      </ActionMenuContent>
    </ActionMenu>
  );
};
