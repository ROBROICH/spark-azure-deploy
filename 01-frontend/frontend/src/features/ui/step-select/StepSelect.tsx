import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { cn } from '@/features/ui/style/cn';
import { Link, type LinkProps } from '@tanstack/react-router';
import { Check, Menu } from 'lucide-react';

export type StepSelectOption<TLinkProps extends LinkProps = LinkProps> = {
  value: string;
  code: string;
  title: string;
  disabled?: boolean;
} & Pick<TLinkProps, 'to' | 'params'>;

type StepSelectProps = {
  value: string;
  options: StepSelectOption[];
  disabled?: boolean;
  className?: string;
  triggerAriaLabel: string;
  navAriaLabel: string;
};

const triggerShadow =
  'shadow-[inset_0_0_0_0.5px_rgb(148,163,184),0px_2px_4px_0px_rgba(2,6,23,0.1),0px_4px_16px_0px_rgba(2,6,23,0.1),inset_0px_-4px_8px_0px_rgba(2,6,23,0.05)]';

export function StepSelect(props: StepSelectProps) {
  const {
    value,
    options,
    disabled,
    className,
    triggerAriaLabel,
    navAriaLabel,
  } = props;
  const selectedOption = options.find((option) => option.value === value);

  if (!selectedOption) {
    return null;
  }

  return (
    <nav aria-label={navAriaLabel}>
      <ActionMenu>
        <ActionMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${triggerAriaLabel}: ${selectedOption.title}`}
            disabled={disabled}
            className={cn(
              'focus-ring inline-flex min-w-0 items-center gap-1 rounded-lg bg-white p-1 pr-3 text-left transition-all disabled:pointer-events-none disabled:opacity-40',
              triggerShadow,
              className,
            )}
          >
            <span className="flex size-6 items-center justify-center rounded-[4px] p-1 text-brand-950">
              <Menu className="size-4" aria-hidden />
            </span>
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={cn(
                  'flex size-6 shrink-0 items-center justify-center rounded-[4px] px-1 text-[11px] leading-[14px] font-medium tracking-[0.22px]',
                  'bg-neutral-200 text-brand-950',
                )}
              >
                {selectedOption.code}
              </span>
              <span className="truncate text-[11px] leading-[14px] font-medium tracking-[0.22px] text-brand-950">
                {selectedOption.title}
              </span>
            </span>
          </button>
        </ActionMenuTrigger>

        <ActionMenuContent align="start" className="min-w-[18rem]">
          {options.map((option) => (
            <ActionMenuItem
              key={option.value}
              disabled={option.disabled}
              asChild
              aria-current={option.value === value ? 'page' : undefined}
              onSelect={(event) => event.preventDefault()}
              className={cn(
                'h-auto justify-between gap-3 px-3 py-2',
                option.value === value && 'bg-slate-500 text-neutral-white',
              )}
            >
              <Link to={option.to} params={option.params}>
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-[4px] px-1 text-[11px] leading-[14px] font-medium tracking-[0.22px]',
                      'bg-white/10 text-neutral-white',
                    )}
                  >
                    {option.code}
                  </span>
                  <span
                    className={cn(
                      'truncate text-[11px] leading-[14px] font-medium tracking-[0.22px]',
                      option.value === value
                        ? 'text-neutral-white'
                        : 'text-slate-300',
                    )}
                  >
                    {option.title}
                  </span>
                </span>
                {option.value === value && (
                  <Check className="size-4 text-neutral-white" aria-hidden />
                )}
              </Link>
            </ActionMenuItem>
          ))}
        </ActionMenuContent>
      </ActionMenu>
    </nav>
  );
}
