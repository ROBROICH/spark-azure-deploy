import { cn } from '@/features/ui/style/cn';
import {
  CheckboxItem as DropdownMenuCheckboxItem,
  Content as DropdownMenuContent,
  Group as DropdownMenuGroup,
  Item as DropdownMenuItem,
  Label as DropdownMenuLabel,
  Portal as DropdownMenuPortal,
  RadioGroup as DropdownMenuRadioGroup,
  RadioItem as DropdownMenuRadioItem,
  Root as DropdownMenuRoot,
  Separator as DropdownMenuSeparator,
  Trigger as DropdownMenuTrigger,
} from '@radix-ui/react-dropdown-menu';
import * as React from 'react';
import {
  POPUP_CONTENT_CLASSES,
  POPUP_CONTENT_STYLE,
  POPUP_MENU_CHECKBOX_ITEM_CLASSES,
  POPUP_MENU_ITEM_CLASSES,
} from '../style/popupStyles';

/**
 * When to use ActionMenu vs SelectMenu
 * ─────────────────────────────────────
 * ActionMenu  — role="menu"    — the user picks an *action* to perform (edit,
 *               delete, export). The trigger does not reflect a persisted value.
 *               Use for three-dot / overflow menus on cards, rows, and toolbars.
 *
 * SelectMenu  — role="combobox" + role="listbox" — the user picks a *value*
 *               that is reflected back on the trigger (topic, version, filter).
 *               Screen readers announce the current value before the user opens
 *               the popup; menus do not. Use whenever a selection persists.
 *
 * Multi-select with checkboxes inside an ActionMenu (ActionMenuCheckboxItem) is
 * valid ARIA (role="menuitemcheckbox"). Callers must render their own check icon
 * inside the item since there is no built-in indicator.
 *
 * Sort/filter exception: toolbar sort/filter pills use this menu pattern
 * (ActionMenuRadioGroup / ActionMenuCheckboxItem), not SelectMenu's combobox.
 * Screen readers announce role="combobox" as an editable input, wrongly implying
 * free-text entry for a fixed value set (BITV 9.4.1.2 / WCAG 4.1.2).
 * Reserve SelectMenu's combobox for in-form value fields.
 */

const POPUP_ITEM_CLASSES = POPUP_MENU_ITEM_CLASSES;

type ActionMenuContextValue = {
  close: () => void;
};

const ActionMenuContext = React.createContext<ActionMenuContextValue | null>(
  null,
);

/**
 * Root. Defaults to modal={false} so clicking another trigger counts as an
 * outside interaction and can open a second menu without first closing this one.
 * Pass modal={true} for menus that should trap focus (e.g. inside a dialog).
 */
function ActionMenu(props: React.ComponentProps<typeof DropdownMenuRoot>) {
  const {
    defaultOpen,
    modal = false,
    onOpenChange,
    open: controlledOpen,
    ...rest
  } = props;
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(
    defaultOpen ?? false,
  );
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!isControlled) {
        setUncontrolledOpen(nextOpen);
      }
      onOpenChange?.(nextOpen);
    },
    [isControlled, onOpenChange],
  );

  const close = React.useCallback(
    () => handleOpenChange(false),
    [handleOpenChange],
  );

  const contextValue = React.useMemo<ActionMenuContextValue>(
    () => ({ close }),
    [close],
  );

  return (
    <ActionMenuContext.Provider value={contextValue}>
      <DropdownMenuRoot
        data-slot="action-menu"
        modal={modal}
        open={open}
        onOpenChange={handleOpenChange}
        {...rest}
      />
    </ActionMenuContext.Provider>
  );
}

function ActionMenuTrigger(
  props: React.ComponentProps<typeof DropdownMenuTrigger>,
) {
  return <DropdownMenuTrigger data-slot="action-menu-trigger" {...props} />;
}

function ActionMenuContent(
  props: React.ComponentProps<typeof DropdownMenuContent>,
) {
  const { className, sideOffset = 4, ...rest } = props;
  return (
    <DropdownMenuPortal>
      <DropdownMenuContent
        data-slot="action-menu-content"
        sideOffset={sideOffset}
        className={cn(
          POPUP_CONTENT_CLASSES,
          'flex flex-col gap-1',
          'max-h-(--radix-dropdown-menu-content-available-height) overflow-x-hidden overflow-y-auto',
          className,
        )}
        style={POPUP_CONTENT_STYLE}
        {...rest}
      />
    </DropdownMenuPortal>
  );
}

type ActionMenuItemProps = React.ComponentProps<typeof DropdownMenuItem> & {
  variant?: 'default' | 'destructive';
};

/**
 * A single action. Always closes the menu when activated.
 *
 * Note: if the onSelect handler calls e.preventDefault() (normally used to keep
 * the menu open), this component still closes — intentionally. Action items
 * should always close. For items that must stay open (multi-select checkboxes),
 * use ActionMenuCheckboxItem instead.
 */
function ActionMenuItem(props: ActionMenuItemProps) {
  const { className, onSelect, variant = 'default', ...rest } = props;
  const actionMenu = React.useContext(ActionMenuContext);

  return (
    <DropdownMenuItem
      data-slot="action-menu-item"
      data-variant={variant}
      onSelect={(event) => {
        onSelect?.(event);
        if (event.defaultPrevented) {
          actionMenu?.close();
        }
      }}
      className={cn(
        POPUP_ITEM_CLASSES,
        'data-[variant=destructive]:text-error-200 data-[variant=destructive]:focus:bg-error-900/30',
        className,
      )}
      {...rest}
    />
  );
}

type ActionMenuCheckboxItemProps = React.ComponentProps<
  typeof DropdownMenuCheckboxItem
>;

/**
 * A checkbox item for multi-select patterns (role="menuitemcheckbox").
 * Does not include a built-in check icon — render your own inside the children
 * so you control placement, e.g.:
 *
 *   <ActionMenuCheckboxItem checked={selected} onSelect={(e) => e.preventDefault()}>
 *     {selected ? <Check className="size-3" aria-hidden /> : <span className="size-3" />}
 *     Label
 *   </ActionMenuCheckboxItem>
 *
 * Call e.preventDefault() in onSelect to keep the menu open for multi-select.
 */
function ActionMenuCheckboxItem(props: ActionMenuCheckboxItemProps) {
  const { className, ...rest } = props;
  return (
    <DropdownMenuCheckboxItem
      data-slot="action-menu-checkbox-item"
      className={cn(POPUP_MENU_CHECKBOX_ITEM_CLASSES, className)}
      {...rest}
    />
  );
}

/**
 * Groups single-select items so the popup picks exactly one value. Each child
 * ActionMenuRadioItem renders role="menuitemradio" with aria-checked, so
 * assistive tech receives the current option state. Use this (not
 * ActionMenuCheckboxItem) whenever only one option can be active at a time.
 */
function ActionMenuRadioGroup(
  props: React.ComponentProps<typeof DropdownMenuRadioGroup>,
) {
  return (
    <DropdownMenuRadioGroup data-slot="action-menu-radio-group" {...props} />
  );
}

/**
 * A single-select item (role="menuitemradio") for use inside ActionMenuRadioGroup.
 * Like ActionMenuCheckboxItem it has no built-in indicator — render your own
 * check icon inside the children. Call e.preventDefault() in onSelect to keep the
 * menu open after a selection; the group's onValueChange still fires.
 */
function ActionMenuRadioItem(
  props: React.ComponentProps<typeof DropdownMenuRadioItem>,
) {
  const { className, ...rest } = props;
  return (
    <DropdownMenuRadioItem
      data-slot="action-menu-radio-item"
      className={cn(POPUP_ITEM_CLASSES, className)}
      {...rest}
    />
  );
}

function ActionMenuGroup(
  props: React.ComponentProps<typeof DropdownMenuGroup>,
) {
  return <DropdownMenuGroup data-slot="action-menu-group" {...props} />;
}

function ActionMenuLabel(
  props: React.ComponentProps<typeof DropdownMenuLabel>,
) {
  const { className, ...rest } = props;
  return (
    <DropdownMenuLabel
      data-slot="action-menu-label"
      className={cn(
        'px-2 py-1 text-[10px] font-semibold tracking-wider text-neutral-500 uppercase',
        className,
      )}
      {...rest}
    />
  );
}

function ActionMenuSeparator(
  props: React.ComponentProps<typeof DropdownMenuSeparator>,
) {
  const { className, ...rest } = props;
  return (
    <DropdownMenuSeparator
      data-slot="action-menu-separator"
      className={cn('-mx-1 my-1 h-px bg-white/20', className)}
      {...rest}
    />
  );
}

export {
  ActionMenu,
  ActionMenuCheckboxItem,
  ActionMenuContent,
  ActionMenuGroup,
  ActionMenuItem,
  ActionMenuLabel,
  ActionMenuRadioGroup,
  ActionMenuRadioItem,
  ActionMenuSeparator,
  ActionMenuTrigger,
};
