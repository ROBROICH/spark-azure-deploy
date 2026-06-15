import {
  ActionMenu,
  ActionMenuCheckboxItem,
  ActionMenuContent,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Button } from '@/features/ui/button/Button';
import { cn } from '@/features/ui/style/cn';
import { Check, X } from 'lucide-react';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { useTranslation } from 'react-i18next';

const TRIGGER_BUTTON_CLASSES =
  'focus-ring inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg py-1 pl-1 text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-600 transition-colors hover:text-slate-900 disabled:cursor-default disabled:opacity-50';

type FilterPillMultiSelectTriggerButtonProps =
  ComponentPropsWithoutRef<'button'> & {
    disabled?: boolean;
    icon: ReactNode;
    showClear: boolean;
    triggerLabel: ReactNode;
  };

const FilterPillMultiSelectTriggerButton = forwardRef<
  HTMLButtonElement,
  FilterPillMultiSelectTriggerButtonProps
>((props, ref) => {
  const {
    className,
    disabled = false,
    icon,
    showClear,
    triggerLabel,
    type = 'button',
    ...buttonProps
  } = props;

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cn(
        TRIGGER_BUTTON_CLASSES,
        showClear ? 'pr-1' : 'pr-3',
        className,
      )}
      {...buttonProps}
    >
      <span className="flex size-6 items-center justify-center rounded">
        {icon}
      </span>
      {triggerLabel}
    </button>
  );
});

FilterPillMultiSelectTriggerButton.displayName =
  'FilterPillMultiSelectTriggerButton';

export type FilterPillMultiSelectOption<TValue extends string = string> = {
  value: TValue;
  label: ReactNode;
  disabled?: boolean;
};

type FilterPillMultiSelectProps<TValue extends string = string> = {
  icon: ReactNode;
  options: ReadonlyArray<FilterPillMultiSelectOption<TValue>>;
  value: TValue[];
  onValueChange?: (value: TValue[]) => void;
  label: ReactNode;
  selectedLabel?: ReactNode;
  showSelectedCount?: boolean;
  emptyLabel?: ReactNode;
  /** Accessible name for the trigger, e.g. to expose the selected value when labels are visually truncated. */
  triggerAriaLabel?: string;
  /** Accessible name for the clear button; defaults to the generic reset-filter label. */
  clearAriaLabel?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  triggerClassName?: string;
  contentClassName?: string;
  itemClassName?: string;
  align?: 'start' | 'center' | 'end';
};

/**
 * Renders a compact checkbox-menu filter pill for string-array filter state.
 *
 * @param props Multi-select filter options, current values, and presentation labels.
 * @returns A trigger pill with checkbox menu and optional adjacent clear button.
 */
export function FilterPillMultiSelect<TValue extends string = string>(
  props: FilterPillMultiSelectProps<TValue>,
) {
  const { t } = useTranslation('shared');
  const {
    icon,
    options,
    value,
    onValueChange,
    label,
    selectedLabel,
    showSelectedCount = true,
    emptyLabel = '—',
    triggerAriaLabel,
    clearAriaLabel,
    clearable = true,
    disabled = false,
    className,
    triggerClassName,
    contentClassName,
    itemClassName,
    align = 'start',
  } = props;

  const selectedValues = new Set<TValue>(value);
  const isActive = value.length > 0;
  const showClear =
    !disabled && clearable && Boolean(onValueChange) && isActive;
  const countLabel =
    showSelectedCount && value.length > 0 ? ` (${value.length})` : null;
  const triggerLabel = (
    <>
      {selectedLabel ?? label}
      {selectedLabel ? null : countLabel}
    </>
  );

  const updateOption = (optionValue: TValue, nextChecked: boolean) => {
    if (!onValueChange) {
      return;
    }

    if (nextChecked) {
      onValueChange([...value, optionValue]);
      return;
    }

    onValueChange(
      value.filter((selectedValue) => selectedValue !== optionValue),
    );
  };

  const clear = (event: SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onValueChange?.([]);
  };

  if (disabled) {
    return (
      <div className={cn('inline-flex items-center gap-0', className)}>
        <FilterPillMultiSelectTriggerButton
          disabled
          icon={icon}
          showClear={showClear}
          triggerLabel={triggerLabel}
          aria-label={triggerAriaLabel}
          className={triggerClassName}
        />
      </div>
    );
  }

  return (
    <div className={cn('inline-flex items-center gap-0', className)}>
      <ActionMenu>
        <ActionMenuTrigger asChild>
          <FilterPillMultiSelectTriggerButton
            icon={icon}
            showClear={showClear}
            triggerLabel={triggerLabel}
            aria-label={triggerAriaLabel}
            className={triggerClassName}
          />
        </ActionMenuTrigger>
        <ActionMenuContent
          align={align}
          className={cn('max-w-md min-w-56', contentClassName)}
        >
          {options.length === 0 ? (
            <ActionMenuCheckboxItem disabled>
              <span className="size-4" aria-hidden="true" />
              {emptyLabel}
            </ActionMenuCheckboxItem>
          ) : (
            options.map((option) => {
              const checked = selectedValues.has(option.value);

              return (
                <ActionMenuCheckboxItem
                  key={option.value}
                  checked={checked}
                  disabled={option.disabled}
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={(nextChecked) => {
                    updateOption(option.value, nextChecked);
                  }}
                  className={cn('whitespace-normal', itemClassName)}
                >
                  {checked ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    <span className="size-4" aria-hidden="true" />
                  )}
                  {option.label}
                </ActionMenuCheckboxItem>
              );
            })
          )}
        </ActionMenuContent>
      </ActionMenu>
      {showClear ? (
        <Button
          aria-label={clearAriaLabel ?? t('common.resetFilter')}
          className="focus-ring cursor-pointer rounded-full p-0.5 transition-all hover:bg-black/10"
          onClick={clear}
          variant="ghost-light"
          size="xs"
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
