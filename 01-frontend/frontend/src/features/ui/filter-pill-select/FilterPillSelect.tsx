import {
  SelectMenuContent,
  SelectMenuOption,
  SelectMenuRoot,
  SelectMenuTrigger,
  SelectMenuViewport,
} from '@/features/ui/select-menu/SelectMenu';
import { cn } from '@/features/ui/style/cn';
import { X } from 'lucide-react';
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../button/Button';

const TRIGGER_BUTTON_CLASSES =
  'focus-ring inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg py-1 pl-1 text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-600 transition-colors hover:text-slate-900 disabled:cursor-default disabled:opacity-50';

type FilterPillSelectTriggerButtonProps = ComponentPropsWithoutRef<'button'> & {
  disabled?: boolean;
  icon: ReactNode;
  showClear: boolean;
  triggerLabel: ReactNode;
};

const FilterPillSelectTriggerButton = forwardRef<
  HTMLButtonElement,
  FilterPillSelectTriggerButtonProps
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

FilterPillSelectTriggerButton.displayName = 'FilterPillSelectTriggerButton';

export type FilterPillSelectOption<
  TValue extends string,
  TQueryValue extends string | undefined = TValue | undefined,
> = {
  value: TValue;
  label: ReactNode;
  queryValue?: TQueryValue;
  disabled?: boolean;
};

type FilterPillSelectProps<
  TValue extends string = string,
  TQueryValue extends string | undefined = TValue | undefined,
> = {
  icon: ReactNode;
  options: ReadonlyArray<FilterPillSelectOption<TValue, TQueryValue>>;
  value?: TQueryValue;
  onValueChange?: (value: TQueryValue | undefined) => void;
  label?: ReactNode;
  labelMode?: 'selected' | 'static';
  fallbackLabel?: ReactNode;
  /** Accessible name for the trigger, e.g. to expose the selected value when `labelMode` is `static`. */
  triggerAriaLabel?: string;
  /** Accessible name for the clear button; defaults to the generic reset-filter label. */
  clearAriaLabel?: string;
  clearable?: boolean;
  disabled?: boolean;
  className?: string;
  align?: 'start' | 'center' | 'end';
};

const getOptionQueryValue = <
  TValue extends string,
  TQueryValue extends string | undefined,
>(
  option: FilterPillSelectOption<TValue, TQueryValue>,
) => {
  if ('queryValue' in option) {
    return option.queryValue;
  }

  return option.value as unknown as TQueryValue;
};

export function FilterPillSelect<
  TValue extends string = string,
  TQueryValue extends string | undefined = TValue | undefined,
>(props: FilterPillSelectProps<TValue, TQueryValue>) {
  const { t } = useTranslation('shared');
  const {
    icon,
    options,
    value,
    onValueChange,
    label,
    labelMode = 'selected',
    fallbackLabel,
    triggerAriaLabel,
    clearAriaLabel,
    clearable = true,
    disabled = false,
    className,
    align = 'start',
  } = props;

  const selectedOption = options.find(
    (option) => getOptionQueryValue(option) === value,
  );
  const isActive = value !== undefined;
  const showClear =
    !disabled && clearable && Boolean(onValueChange) && isActive;
  const triggerLabel =
    labelMode === 'static'
      ? label
      : (selectedOption?.label ?? fallbackLabel ?? label ?? null);

  const handleClear = (event: SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onValueChange?.(undefined);
  };

  if (disabled) {
    return (
      <div className={cn('inline-flex items-center gap-0', className)}>
        <FilterPillSelectTriggerButton
          disabled
          icon={icon}
          showClear={showClear}
          triggerLabel={triggerLabel}
          aria-label={triggerAriaLabel}
        />
      </div>
    );
  }

  return (
    <div className={cn('inline-flex items-center gap-0', className)}>
      <SelectMenuRoot
        value={selectedOption?.value ?? ''}
        onValueChange={(strValue) => {
          const option = options.find((o) => o.value === strValue);
          if (option) {
            onValueChange?.(getOptionQueryValue(option));
          }
        }}
      >
        <SelectMenuTrigger asChild>
          <FilterPillSelectTriggerButton
            icon={icon}
            showClear={showClear}
            triggerLabel={triggerLabel}
            aria-label={triggerAriaLabel}
          />
        </SelectMenuTrigger>
        <SelectMenuContent align={align}>
          <SelectMenuViewport className="p-1">
            {options.map((option) => (
              <SelectMenuOption
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </SelectMenuOption>
            ))}
          </SelectMenuViewport>
        </SelectMenuContent>
      </SelectMenuRoot>
      {showClear ? (
        <Button
          aria-label={clearAriaLabel ?? t('common.resetFilter')}
          className="focus-ring cursor-pointer rounded-full p-0.5 transition-all hover:bg-black/10"
          onClick={handleClear}
          variant="ghost-light"
          size="xs"
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}
