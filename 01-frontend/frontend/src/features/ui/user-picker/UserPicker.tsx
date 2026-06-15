import {
  ActionMenu,
  ActionMenuCheckboxItem,
  ActionMenuContent,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import {
  POPUP_MENU_CHECKBOX_ITEM_SECONDARY_TEXT_CLASSES,
  POPUP_CONTENT_INNER_VIEWPORT_CLASSES,
} from '@/features/ui/style/popupStyles';
import { cn } from '@/features/ui/style/cn';
import { Check, ChevronDown } from 'lucide-react';
import { cloneElement, useId, useState } from 'react';
import type React from 'react';

export type UserPickerOption = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
};

export type UserPickerProps = {
  id?: string;
  users: UserPickerOption[];
  value: string[];
  onChange: (value: string[]) => void;
  onBlur?: () => void;
  emptyLabel: string;
  maxSelected?: number;
  disabled?: boolean;
  invalid?: boolean;
  'aria-describedby'?: string;
  ariaDescribedBy?: string;
  className?: string;
} & (
  | {
      label: string;
      placeholder: string;
      selectedCountLabel: (count: number) => string;
      trigger?: undefined;
    }
  | {
      trigger: React.ReactElement;
      label?: never;
      placeholder?: never;
      selectedCountLabel?: never;
    }
);

type TriggerAccessibilityProps = {
  'aria-label'?: string;
  'aria-describedby'?: string;
  children?: React.ReactNode;
};

const getTriggerLabel = (props: {
  selectedUsers: UserPickerOption[];
  placeholder: string;
  selectedCountLabel: (count: number) => string;
}) => {
  const { placeholder, selectedCountLabel, selectedUsers } = props;

  if (selectedUsers.length === 0) {
    return placeholder;
  }

  if (selectedUsers.length === 1) {
    return selectedUsers.at(0)?.label ?? placeholder;
  }

  return selectedCountLabel(selectedUsers.length);
};

/**
 * Keeps the built-in trigger label contract separate from custom triggers so
 * icon-only consumers own their own accessible trigger name.
 */
export function UserPicker(props: UserPickerProps) {
  const {
    className,
    disabled = false,
    emptyLabel,
    id,
    invalid = false,
    ariaDescribedBy,
    maxSelected,
    onBlur,
    onChange,
    trigger,
    users,
    value,
  } = props;
  const describedBy = props['aria-describedby'] ?? ariaDescribedBy;
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();
  const selectedIds = new Set(value);
  const selectedUsers = users.filter((user) => selectedIds.has(user.id));
  const hasReachedMaxSelected =
    typeof maxSelected === 'number' && selectedIds.size >= maxSelected;
  const triggerLabel = trigger
    ? null
    : getTriggerLabel({
        selectedUsers,
        placeholder: props.placeholder,
        selectedCountLabel: props.selectedCountLabel,
      });
  const customTrigger = (() => {
    if (!trigger) {
      return null;
    }

    const triggerProps = trigger.props as TriggerAccessibilityProps;
    const ariaLabel =
      triggerProps['aria-label'] ??
      (typeof triggerProps.children === 'string'
        ? triggerProps.children
        : undefined);

    return cloneElement(
      trigger as React.ReactElement<TriggerAccessibilityProps>,
      {
        'aria-label': ariaLabel,
        'aria-describedby': describedBy ?? triggerProps['aria-describedby'],
      },
    );
  })();

  const toggleUser = (userId: string) => {
    if (selectedIds.has(userId)) {
      onChange(value.filter((selectedId) => selectedId !== userId));
      return;
    }

    if (hasReachedMaxSelected) {
      return;
    }

    onChange([...value, userId]);
  };

  return (
    <ActionMenu modal open={isOpen} onOpenChange={setIsOpen}>
      <ActionMenuTrigger asChild>
        {customTrigger ?? (
          <button
            id={id}
            type="button"
            disabled={disabled}
            aria-label={props.label}
            aria-describedby={describedBy}
            onBlur={onBlur}
            className={cn(
              'focus-ring flex h-9 w-full min-w-0 items-center justify-between gap-1 rounded-md border border-border-form bg-transparent px-3 py-1 transition-colors',
              invalid && 'border-error-800 ring-2 ring-error-800 ring-offset-1',
              disabled && 'cursor-not-allowed opacity-50',
              className,
            )}
          >
            <span className="block min-w-0 flex-1 truncate text-left text-sm font-medium text-brand-950">
              {triggerLabel}
            </span>
            <ChevronDown aria-hidden className="size-4 shrink-0 opacity-50" />
          </button>
        )}
      </ActionMenuTrigger>
      <ActionMenuContent
        id={contentId}
        align="start"
        className="max-h-80 w-[min(24rem,calc(100vw-2rem))] gap-0 overflow-y-auto"
      >
        <div className={POPUP_CONTENT_INNER_VIEWPORT_CLASSES}>
          {users.length === 0 ? (
            <div
              role="menuitem"
              aria-disabled="true"
              tabIndex={-1}
              className="px-2 py-1.5 text-[11px] leading-[14px] font-medium text-neutral-300"
            >
              {emptyLabel}
            </div>
          ) : (
            users.map((user) => {
              const checked = selectedIds.has(user.id);

              return (
                <ActionMenuCheckboxItem
                  key={user.id}
                  checked={checked}
                  disabled={
                    user.disabled || (!checked && hasReachedMaxSelected)
                  }
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={() => toggleUser(user.id)}
                  className="group h-auto min-h-8 items-start py-1.5"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {checked ? <Check aria-hidden className="size-3" /> : null}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{user.label}</span>
                    {user.description ? (
                      <span
                        className={cn(
                          'truncate text-[10px] leading-3',
                          POPUP_MENU_CHECKBOX_ITEM_SECONDARY_TEXT_CLASSES,
                        )}
                      >
                        {user.description}
                      </span>
                    ) : null}
                  </span>
                </ActionMenuCheckboxItem>
              );
            })
          )}
        </div>
      </ActionMenuContent>
    </ActionMenu>
  );
}
