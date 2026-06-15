import { AiButton } from '@/features/ui/ai/AiButton';
import { Button } from '@/features/ui/button/Button';
import {
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from '@/features/ui/popover/Popover';
import { cn } from '@/features/ui/style/cn';
import { CircleAlert, X } from 'lucide-react';
import { useState } from 'react';

export type AiOutdatedBadgeAction = {
  disabled?: boolean;
  isLoading?: boolean;
  label: string;
  onClick?: () => void;
};

export type AiOutdatedBadgeTooltip = {
  ariaLabel?: string;
  closeLabel: string;
  description: string;
  instruction?: string;
  refreshAction?: AiOutdatedBadgeAction;
  title: string;
  versionAction?: AiOutdatedBadgeAction;
};

type AiOutdatedBadgeProps = {
  className?: string;
  label: string;
  tooltip?: AiOutdatedBadgeTooltip;
};

const BADGE_CLASSNAME =
  'inline-flex shrink-0 items-center gap-0.5 rounded bg-[#9A3412] px-1 py-px text-[11px] leading-[14px] font-medium tracking-[0.02em] whitespace-nowrap text-white';

/**
 * Renders the shared outdated AI-result badge with optional tooltip details and
 * generic action slots.
 *
 * @param props Badge label, optional tooltip copy, and optional actions.
 * @returns Static badge text or a click-triggered tooltip badge.
 */
export function AiOutdatedBadge(props: AiOutdatedBadgeProps) {
  const { className, label, tooltip } = props;
  const [isOpen, setIsOpen] = useState(false);
  const resolvedBadgeClassName = cn(
    BADGE_CLASSNAME,
    tooltip && 'focus-ring cursor-pointer',
    className,
  );
  const badgeContent = (
    <>
      <CircleAlert className="size-2.5 shrink-0" aria-hidden="true" />
      {label}
    </>
  );

  if (!tooltip) {
    return <span className={resolvedBadgeClassName}>{badgeContent}</span>;
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={resolvedBadgeClassName}>
          {badgeContent}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        role="dialog"
        aria-label={tooltip.ariaLabel ?? tooltip.title}
        className="w-[360px] max-w-[calc(100vw-16px)] rounded-xl border-slate-800 bg-slate-800 p-1 text-white shadow-[0px_4px_16px_0px_rgba(2,6,23,0.18)]"
      >
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-white">
              <CircleAlert className="size-4" aria-hidden="true" />
            </span>
            <p className="min-w-0 flex-1 text-[13px] leading-[18px] font-medium text-white">
              {tooltip.title}
            </p>
            <PopoverClose asChild>
              <button
                type="button"
                className="focus-ring flex size-8 shrink-0 items-center justify-center rounded-lg text-white/80 hover:text-white"
                aria-label={tooltip.closeLabel}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </PopoverClose>
          </div>
          <div className="flex min-w-0 flex-col gap-2 px-2 text-[11px] leading-[14px] font-normal tracking-[0.02em] text-white">
            <p>{tooltip.description}</p>
            {tooltip.instruction ? <p>{tooltip.instruction}</p> : null}
          </div>
          {tooltip.versionAction || tooltip.refreshAction ? (
            <div className="flex min-w-0 items-center justify-between gap-2 [&>span]:max-w-full [&>span]:min-w-0">
              {tooltip.versionAction ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={
                    tooltip.versionAction.disabled ||
                    !tooltip.versionAction.onClick
                  }
                  onClick={tooltip.versionAction.onClick}
                >
                  {tooltip.versionAction.label}
                </Button>
              ) : null}
              {tooltip.refreshAction ? (
                <AiButton
                  size="sm"
                  className="h-8 max-w-full rounded-lg py-1 pr-3 pl-2"
                  label={tooltip.refreshAction.label}
                  isLoading={tooltip.refreshAction.isLoading}
                  isDisabled={
                    tooltip.refreshAction.disabled ||
                    tooltip.refreshAction.isLoading ||
                    !tooltip.refreshAction.onClick
                  }
                  onClick={tooltip.refreshAction.onClick}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
