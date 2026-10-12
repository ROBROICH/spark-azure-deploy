import { cn } from '@/features/ui/style/cn';
import {
  Content as SelectContentPrimitive,
  Item as SelectItem,
  ItemIndicator as SelectItemIndicator,
  ItemText as SelectItemText,
  Portal as SelectPortal,
  Root as SelectRoot,
  Trigger as SelectTrigger,
  Value as SelectValue,
  Viewport as SelectViewport,
} from '@radix-ui/react-select';
import { Check, ChevronDown } from 'lucide-react';
import * as React from 'react';
import {
  POPUP_CONTENT_CLASSES,
  POPUP_CONTENT_INNER_VIEWPORT_CLASSES,
  POPUP_CONTENT_STYLE,
  POPUP_SELECT_ITEM_CLASSES,
} from '../style/popupStyles';

type SelectMenuItem = {
  value: string;
  label: string;
  disabled?: boolean;
};

type SelectMenuProps = {
  items: SelectMenuItem[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  /**
   * Controls the trigger's default appearance.
   *
   * - `'input'` (default) — form-field style: transparent bg, `border-border-form`, `h-9`.
   *   Use in forms alongside `<Input>` and other form controls.
   *
   * - `'badge'` — compact inline style: white bg, thin `border-slate-400`, `rounded-[4px]`,
   *   `text-[11px]`, chevron separator line. Use inside cards, table rows, or any inline
   *   UI context where the select is not a form field.
   */
  variant?: 'input' | 'badge';
  className?: string;
  triggerClassName?: string;
  valueClassName?: string;
  chevronClassName?: string;
  itemClassName?: string;
  /** Accessible label for the trigger button. */
  ariaLabel?: string;
  /** References visible label text that names the trigger button. */
  ariaLabelledBy?: string;
  /** Links the trigger to an error or hint element. Pass the error element's `id`. */
  ariaDescribedby?: string;
  required?: boolean;
  disabled?: boolean;
  id?: string;
  /** Sets `aria-invalid` on the trigger — adds a red border + ring matching the `Input` invalid state. */
  invalid?: boolean;
  onBlur?: () => void;
};

/**
 * Styled dark popup content wrapper. Use when composing a custom-trigger
 * select with `SelectMenuTrigger asChild`. Includes its own Portal.
 *
 * @example
 * <SelectMenuRoot value={value} onValueChange={onChange}>
 *   <SelectMenuTrigger asChild><MyPillButton /></SelectMenuTrigger>
 *   <SelectMenuContent>
 *     <SelectMenuViewport>
 *       <SelectMenuOption value="a">Option A</SelectMenuOption>
 *     </SelectMenuViewport>
 *   </SelectMenuContent>
 * </SelectMenuRoot>
 */
function SelectMenuContent(
  props: React.ComponentProps<typeof SelectContentPrimitive>,
) {
  const {
    className,
    align = 'start',
    sideOffset = 4,
    children,
    ...rest
  } = props;
  return (
    <SelectPortal>
      <SelectContentPrimitive
        position="popper"
        align={align}
        sideOffset={sideOffset}
        className={cn(
          POPUP_CONTENT_CLASSES,
          'max-h-(--radix-select-content-available-height) overflow-x-hidden overflow-y-auto',
          className,
        )}
        style={POPUP_CONTENT_STYLE}
        {...rest}
      >
        {children}
      </SelectContentPrimitive>
    </SelectPortal>
  );
}

/**
 * Styled dark item for use inside `SelectMenuContent`. Renders with the
 * standard dark hover/selected states and a check indicator.
 */
function SelectMenuOption(props: React.ComponentProps<typeof SelectItem>) {
  const { className, children, ...rest } = props;
  return (
    <SelectItem className={cn(POPUP_SELECT_ITEM_CLASSES, className)} {...rest}>
      <SelectItemText>{children}</SelectItemText>
      <SelectItemIndicator>
        <Check
          className="size-4 shrink-0 forced-colors:text-[color:CanvasText]"
          aria-hidden="true"
        />
      </SelectItemIndicator>
    </SelectItem>
  );
}

/**
 * Dark-styled single-select built on Radix Select for full screen reader and
 * keyboard accessibility. The trigger with selected-value display is built in;
 * use `triggerClassName` / `valueClassName` / `chevronClassName` to customise
 * its appearance.
 *
 * Why Radix Select and not a native <select>?
 * Native <select> has excellent AT support but the open dropdown is OS-rendered
 * and cannot be dark-themed — it shows a white/grey system picker regardless of
 * the app's design. Since the design system is dark-only, use SelectMenu for all
 * single-value picks so the popup matches. Only prefer native <select> if you
 * need form submission without JavaScript (not applicable in this codebase —
 * all forms are controlled React forms).
 *
 * Why Radix Select and not DropdownMenu primitives?
 * DropdownMenu uses role="menu" + role="menuitem" — semantically an action menu.
 * Select uses role="combobox" + role="listbox" — semantically a value picker.
 * Screen readers announce them differently: listbox says "3 of 6, selected";
 * menu says nothing about the current value. Use Select for any "choose a value"
 * interaction; use ActionMenu for "pick an action to perform".
 *
 * Exception — sort/filter controls: do NOT use SelectMenu here. Screen readers
 * announce role="combobox" as an editable input, wrongly implying free-text entry
 * for a fixed value set (BITV 9.4.1.2 / WCAG 4.1.2). Sort/filter pills
 * use the menu pattern instead (see FilterPillSelect / ActionMenuRadioGroup);
 * SelectMenu's combobox stays correct for in-form value fields.
 *
 * Need a custom trigger? Use the primitives:
 * SelectMenuRoot, SelectMenuTrigger, SelectMenuContent, SelectMenuOption, SelectMenuValue.
 *
 * For multi-select, use ActionMenu + ActionMenuCheckboxItem so Radix owns the
 * keyboard and assistive-technology behavior.
 */
const TRIGGER_VARIANT_CLASSES = {
  input:
    'focus-ring flex h-9 min-w-0 items-center justify-between gap-1 rounded-md border border-border-form bg-transparent px-3 py-1 transition-colors aria-invalid:border-error-800 aria-invalid:ring-2 aria-invalid:ring-error-800 aria-invalid:ring-offset-1',
  badge:
    'focus-ring inline-flex min-h-8 max-w-full min-w-0 items-center rounded-[4px] border-[0.5px] border-slate-400 bg-white',
} satisfies Record<NonNullable<SelectMenuProps['variant']>, string>;

const VALUE_VARIANT_CLASSES = {
  input:
    'block min-w-0 flex-1 truncate text-left text-sm font-medium text-brand-950',
  badge:
    'block min-w-0 flex-1 truncate px-2 py-[5px] text-[11px] leading-[1.27] font-medium tracking-[0.02em] text-slate-600',
} satisfies Record<NonNullable<SelectMenuProps['variant']>, string>;

const CHEVRON_VARIANT_CLASSES = {
  input: 'flex shrink-0 items-center',
  badge:
    'flex shrink-0 items-center justify-center border-l-[0.5px] border-slate-400 p-1',
} satisfies Record<NonNullable<SelectMenuProps['variant']>, string>;

function SelectMenu(props: SelectMenuProps) {
  const {
    items,
    value,
    onChange,
    placeholder,
    align = 'start',
    sideOffset = 4,
    variant = 'input',
    className,
    triggerClassName,
    valueClassName,
    chevronClassName,
    itemClassName,
    ariaLabel,
    ariaLabelledBy,
    ariaDescribedby,
    required,
    disabled = false,
    id,
    invalid,
    onBlur,
  } = props;

  return (
    <SelectRoot
      value={value}
      onValueChange={onChange}
      disabled={disabled}
      onOpenChange={(open) => {
        if (!open) {
          onBlur?.();
        }
      }}
    >
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedby || undefined}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onBlur={(e) => {
          // Only call onBlur when focus leaves outside the select
          const relatedTarget = e.relatedTarget;
          const inPortal =
            relatedTarget instanceof Element &&
            relatedTarget.closest('[data-radix-popper-content-wrapper]');
          if (!inPortal) {
            onBlur?.();
          }
        }}
        className={cn(
          TRIGGER_VARIANT_CLASSES[variant],
          disabled && 'cursor-not-allowed opacity-50',
          triggerClassName,
        )}
      >
        <span className={cn(VALUE_VARIANT_CLASSES[variant], valueClassName)}>
          <SelectValue placeholder={placeholder} />
        </span>
        <span
          className={cn(CHEVRON_VARIANT_CLASSES[variant], chevronClassName)}
        >
          <ChevronDown className="size-4 opacity-50" aria-hidden="true" />
        </span>
      </SelectTrigger>

      <SelectMenuContent
        align={align}
        sideOffset={sideOffset}
        className={className}
      >
        <SelectViewport className={POPUP_CONTENT_INNER_VIEWPORT_CLASSES}>
          {items.map((item) => (
            <SelectMenuOption
              key={item.value}
              value={item.value}
              disabled={item.disabled}
              className={itemClassName}
            >
              {item.label}
            </SelectMenuOption>
          ))}
        </SelectViewport>
      </SelectMenuContent>
    </SelectRoot>
  );
}

const SelectMenuRoot = SelectRoot;
const SelectMenuTrigger = SelectTrigger;
const SelectMenuValue = SelectValue;
const SelectMenuViewport = SelectViewport;

export {
  SelectMenu,
  SelectMenuContent,
  SelectMenuOption,
  SelectMenuRoot,
  SelectMenuTrigger,
  SelectMenuValue,
  SelectMenuViewport,
};
export type { SelectMenuItem, SelectMenuProps };
