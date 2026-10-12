import { AccordionTrigger } from '@/features/ui/accordion/Accordion';
import {
  ActionMenu,
  ActionMenuCheckboxItem,
  ActionMenuContent,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Button } from '@/features/ui/button/Button';
import { SplitButton } from '@/features/ui/button/SplitButton';
import { useBelowLg } from '@/features/ui/responsive/useMobile';
import { cn } from '@/features/ui/style/cn';
import { TooltipProvider } from '@/features/ui/tooltip/Tooltip';
import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { Check, ChevronRight, MoreVertical } from 'lucide-react';

export type OutlineCheckSlotProps = {
  isChecked: boolean;
  shouldRenderCheckSlot: boolean;
  canToggleChecked: boolean;
  markLabel: string;
  markedLabel: string;
  unmarkLabel: string;
  actionsMenuAriaLabel: string;
  tooltipCopy: string;
  disabledTooltipCopy?: string;
  assigneeCompletedIndicator?: {
    ariaLabel: string;
    tooltip: string;
  };
  onCheckedChange: (nextChecked: boolean) => void;
};

type OutlineRowProps = {
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  rowClassName: string;
  label: string;
  nodeId: string;
  checkSlotProps: OutlineCheckSlotProps;
  onSelect: (nodeId: string) => void;
};

const OutlineCheckSlot = (props: OutlineCheckSlotProps) => {
  const {
    isChecked,
    shouldRenderCheckSlot,
    canToggleChecked,
    markLabel,
    markedLabel,
    unmarkLabel,
    actionsMenuAriaLabel,
    tooltipCopy,
    disabledTooltipCopy,
    assigneeCompletedIndicator,
    onCheckedChange,
  } = props;
  const isCompact = useBelowLg();

  if (!shouldRenderCheckSlot) {
    return null;
  }

  const resolvedTooltipCopy = disabledTooltipCopy ?? tooltipCopy;
  const itemLabel = isChecked ? unmarkLabel : markLabel;
  const triggerAriaLabel = `${actionsMenuAriaLabel} \u2014 ${resolvedTooltipCopy}`;

  const assigneeIndicator = assigneeCompletedIndicator ? (
    <TooltipProvider delayDuration={200}>
      <TooltipWrapper
        content={assigneeCompletedIndicator.tooltip}
        side="top"
        className="whitespace-pre-line"
      >
        <span
          className="inline-flex size-6 items-center justify-center rounded-[4px] bg-green-800 text-white shadow-elevated"
          role="img"
          aria-label={assigneeCompletedIndicator.ariaLabel}
          title={assigneeCompletedIndicator.tooltip}
        >
          <Check className="size-4 shrink-0" aria-hidden="true" />
        </span>
      </TooltipWrapper>
    </TooltipProvider>
  ) : null;

  if (!isCompact) {
    return (
      <div className="pointer-events-auto relative z-10 ml-auto flex shrink-0 items-center gap-2">
        {assigneeIndicator}
        <TooltipProvider delayDuration={200}>
          <TooltipWrapper content={disabledTooltipCopy} side="top">
            <span className="inline-flex" title={disabledTooltipCopy}>
              <SplitButton
                size="sm"
                checked={isChecked}
                disabled={!canToggleChecked}
                uncheckedLabel={markLabel}
                checkedLabel={markedLabel}
                onCheckedChange={onCheckedChange}
                onPointerDown={(event) => event.stopPropagation()}
                aria-label={triggerAriaLabel}
                title={resolvedTooltipCopy}
              />
            </span>
          </TooltipWrapper>
        </TooltipProvider>
      </div>
    );
  }

  const iconButton = (isEnabled: boolean) => (
    <Button
      variant="ghost-light"
      size="xs"
      iconOnly
      disabled={!isEnabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      aria-label={triggerAriaLabel}
      title={resolvedTooltipCopy}
    >
      <MoreVertical aria-hidden="true" />
    </Button>
  );

  const checkedIndicator = isChecked ? (
    <Check
      className="size-4 shrink-0 text-green-900"
      data-testid="outline-checked-indicator"
      aria-hidden="true"
    />
  ) : null;

  if (!canToggleChecked) {
    return (
      <div className="pointer-events-auto relative z-10 ml-auto flex shrink-0 items-center gap-2">
        {assigneeIndicator}
        {checkedIndicator}
        <TooltipProvider delayDuration={200}>
          <TooltipWrapper content={disabledTooltipCopy} side="top">
            <span className="inline-flex" title={disabledTooltipCopy}>
              {iconButton(false)}
            </span>
          </TooltipWrapper>
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto relative z-10 ml-auto flex shrink-0 items-center gap-2">
      {assigneeIndicator}
      {checkedIndicator}
      <ActionMenu>
        <ActionMenuTrigger asChild>{iconButton(true)}</ActionMenuTrigger>
        <ActionMenuContent align="end">
          <ActionMenuCheckboxItem
            checked={isChecked}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={onCheckedChange}
          >
            {itemLabel}
          </ActionMenuCheckboxItem>
        </ActionMenuContent>
      </ActionMenu>
    </div>
  );
};

export const getOutlineRowStateClassName = (options: {
  isChecked: boolean;
  isSelected: boolean;
}) => {
  if (options.isChecked) {
    return 'font-medium text-green-900';
  }

  if (options.isSelected) {
    return 'bg-slate-50 font-medium text-brand-navy';
  }

  return 'hover:bg-surface-secondary font-normal text-slate-600';
};

const ExpandableOutlineRow = (props: OutlineRowProps) => {
  const {
    isExpanded,
    isSelected,
    rowClassName,
    label,
    nodeId,
    checkSlotProps,
    onSelect,
  } = props;

  return (
    <div className="group/row flex w-full items-center gap-2">
      <div className="min-w-0 flex-1">
        <AccordionTrigger
          className={cn(rowClassName, 'w-full min-w-0')}
          onClick={() => onSelect(nodeId)}
          aria-current={isSelected || undefined}
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-slate-600 transition-transform duration-200',
              isExpanded && 'rotate-90',
            )}
            aria-hidden="true"
          />
          <span className="flex-1 truncate">{label}</span>
        </AccordionTrigger>
      </div>
      <OutlineCheckSlot {...checkSlotProps} />
    </div>
  );
};

const LeafOutlineRow = (props: OutlineRowProps) => {
  const { isSelected, rowClassName, label, nodeId, checkSlotProps, onSelect } =
    props;

  return (
    <div className="group/row flex w-full items-center gap-2">
      <div className="min-w-0 flex-1">
        <button
          type="button"
          className={cn(rowClassName, 'w-full min-w-0')}
          onClick={() => onSelect(nodeId)}
          aria-current={isSelected || undefined}
        >
          <ChevronRight
            className="invisible size-4 shrink-0 text-slate-600"
            aria-hidden="true"
          />
          <span className="flex-1 truncate">{label}</span>
        </button>
      </div>
      <OutlineCheckSlot {...checkSlotProps} />
    </div>
  );
};

export const OutlineRow = (props: OutlineRowProps) => {
  if (props.hasChildren) {
    return <ExpandableOutlineRow {...props} />;
  }

  return <LeafOutlineRow {...props} />;
};
