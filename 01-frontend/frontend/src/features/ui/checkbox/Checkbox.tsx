import { Indicator, Root } from '@radix-ui/react-checkbox';
import { Label } from '@/features/ui/label/Label';
import { CheckIcon, MinusIcon } from 'lucide-react';
import { cn } from '@/features/ui/style/cn';

type CheckboxProps = {
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
  checked?: 'checked' | 'unchecked' | 'indeterminate';
  required?: boolean;
  onCheckedOn?: () => void;
  onCheckedOff?: () => void;
  onCheckedChange?: () => void;
};

function Checkbox(props: CheckboxProps) {
  const {
    label,
    ariaLabel,
    disabled = false,
    required = false,
    checked = 'unchecked',
    onCheckedOn,
    onCheckedOff,
    onCheckedChange,
  } = props;
  return (
    <Label className="text-body w-fit">
      <Root
        data-slot="checkbox"
        className={cn(
          'focus-ring size-6 shrink-0 rounded-[5px] border-2 border-brand-950 bg-white text-white shadow-xs transition-shadow disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-brand-950 data-[state=indeterminate]:bg-brand-950',
        )}
        disabled={disabled}
        checked={
          checked === 'indeterminate' ? 'indeterminate' : checked === 'checked'
        }
        required={required}
        aria-label={ariaLabel}
        onCheckedChange={(newCheckedState) => {
          newCheckedState ? onCheckedOn?.() : onCheckedOff?.();
          onCheckedChange?.();
        }}
      >
        <Indicator
          data-slot="checkbox-indicator"
          className="grid place-content-center text-current transition-none"
        >
          {checked === 'indeterminate' ? (
            <MinusIcon className="size-4" />
          ) : (
            <CheckIcon className="size-4" />
          )}
        </Indicator>
      </Root>
      {label}
    </Label>
  );
}

export { Checkbox };
