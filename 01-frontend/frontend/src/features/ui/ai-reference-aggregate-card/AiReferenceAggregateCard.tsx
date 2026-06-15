import { AiButton } from '@/features/ui/ai/AiButton';
import { AiSparklesChip } from '@/features/ui/ai/AiSparklesChip';
import { AiOutdatedBadge } from '@/features/ui/ai-outdated-badge/AiOutdatedBadge';
import { cn } from '@/features/ui/style/cn';
import { ScanSearch } from 'lucide-react';
import type { ComponentProps, MouseEvent, ReactNode } from 'react';

export type AiReferenceAggregateCardAction = {
  disabled?: boolean;
  isLoading?: boolean;
  label: string;
  onClick?: () => void;
};

export type AiReferenceAggregateCardRow = {
  ariaLabel: string;
  href?: string;
  id: string;
  isSelected?: boolean;
  meta: ReactNode;
  onClick?: (event: MouseEvent<HTMLElement>) => void;
  title: ReactNode;
  trailing?: ReactNode;
};

type AiReferenceAggregateCardBaseProps = {
  action?: AiReferenceAggregateCardAction;
  className?: string;
  headerAccessory?: ReactNode;
  rows: AiReferenceAggregateCardRow[];
  rowsId?: string;
  showMoreControl?: ReactNode;
  title: ReactNode;
};

type AiReferenceAggregateCardOutdatedProps =
  | {
      isOutdated: true;
      outdatedLabel: string;
      outdatedTooltip?: ComponentProps<typeof AiOutdatedBadge>['tooltip'];
    }
  | {
      isOutdated?: false;
      outdatedLabel?: undefined;
      outdatedTooltip?: undefined;
    }
  | {
      isOutdated: boolean;
      outdatedLabel: string;
      outdatedTooltip?: ComponentProps<typeof AiOutdatedBadge>['tooltip'];
    };

export type AiReferenceAggregateCardProps = AiReferenceAggregateCardBaseProps &
  AiReferenceAggregateCardOutdatedProps;

const ROW_CLASSES =
  'flex min-w-0 flex-1 items-center gap-2 rounded-[4px] py-1 pr-3 pl-1 text-left transition-colors';
const INTERACTIVE_ROW_CLASSES = 'focus-ring hover:bg-slate-100';

const SELECTED_ROW_CLASSES = 'bg-slate-100 text-slate-900';
const AI_TEXT_CLASSES =
  'bg-linear-to-b from-[rgba(147,51,234,1)] to-[rgba(88,28,135,1)] bg-clip-text text-transparent';

const renderRowContent = (row: AiReferenceAggregateCardRow) => {
  return (
    <>
      <span className="flex shrink-0 items-center rounded-[4px] p-1 text-slate-600">
        <ScanSearch className="size-3" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-700">
        {row.title}
      </span>
      <span className="shrink-0 text-[11px] leading-[14px] tracking-[0.02em] text-slate-700">
        {row.meta}
      </span>
    </>
  );
};

const renderRow = (row: AiReferenceAggregateCardRow) => {
  const rowClassName = cn(
    ROW_CLASSES,
    (row.href || row.onClick) && INTERACTIVE_ROW_CLASSES,
    row.isSelected && SELECTED_ROW_CLASSES,
  );
  const trailing = row.trailing ? (
    <div className="shrink-0 pr-1">{row.trailing}</div>
  ) : null;

  if (row.href) {
    return (
      <li key={row.id} className="flex min-w-0 items-center">
        <a
          href={row.href}
          className={rowClassName}
          aria-current={row.isSelected ? 'location' : undefined}
          aria-label={row.ariaLabel}
          onClick={row.onClick}
        >
          {renderRowContent(row)}
        </a>
        {trailing}
      </li>
    );
  }

  if (!row.onClick) {
    return (
      <li key={row.id} className="flex min-w-0 items-center">
        <div className={rowClassName}>{renderRowContent(row)}</div>
        {trailing}
      </li>
    );
  }

  return (
    <li key={row.id} className="flex min-w-0 items-center">
      <button
        type="button"
        className={rowClassName}
        aria-pressed={row.isSelected ? true : undefined}
        aria-label={row.ariaLabel}
        onClick={row.onClick}
      >
        {renderRowContent(row)}
      </button>
      {trailing}
    </li>
  );
};

export function AiReferenceAggregateCard(props: AiReferenceAggregateCardProps) {
  const {
    action,
    className,
    headerAccessory,
    isOutdated = false,
    outdatedLabel,
    outdatedTooltip,
    rows,
    rowsId,
    showMoreControl,
    title,
  } = props;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-[8px] border-0 border-slate-400 bg-white ring-[0.5px] ring-slate-400 ring-inset',
        className,
      )}
    >
      <div className="flex min-h-8 items-center gap-2 bg-slate-100 p-1">
        <AiSparklesChip
          size="sm"
          className="size-6 p-[3.5px]"
          aria-hidden="true"
        />
        <span
          className={cn(
            'min-w-0 flex-1 truncate text-[11px] leading-[14px] font-medium tracking-[0.02em]',
            AI_TEXT_CLASSES,
          )}
        >
          {title}
        </span>
        {isOutdated && outdatedLabel ? (
          <AiOutdatedBadge label={outdatedLabel} tooltip={outdatedTooltip} />
        ) : null}
        {headerAccessory}
      </div>
      <div className="flex min-w-0 flex-col">
        <ul id={rowsId} className="flex min-w-0 flex-col gap-1 p-1">
          {rows.map(renderRow)}
        </ul>
        {showMoreControl || action ? (
          <div className="flex min-w-0 items-center justify-between gap-2 p-1 leading-none [&>span]:max-w-full [&>span]:min-w-0 [&>span]:leading-none">
            <div className="min-w-0">{showMoreControl}</div>
            {action ? (
              <AiButton
                size="sm"
                label={action.label}
                isLoading={action.isLoading}
                isDisabled={
                  action.disabled || action.isLoading || !action.onClick
                }
                onClick={action.onClick}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
