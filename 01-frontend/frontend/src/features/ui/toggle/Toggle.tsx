import {
  Root as SwitchRoot,
  Thumb as SwitchThumb,
} from '@radix-ui/react-switch';
import { Label } from '@/features/ui/label/Label';
import { cn } from '@/features/ui/style/cn';

type ToggleProps = Readonly<{
  checked?: boolean;
  disabled?: boolean;
  label?: string;
  onCheckedOn?: () => void;
  onCheckedOff?: () => void;
  onCheckedChange?: (checked: boolean) => void;
}>;

function Toggle(props: ToggleProps) {
  const {
    checked,
    disabled = false,
    label,
    onCheckedOn,
    onCheckedOff,
    onCheckedChange,
  } = props;
  const isControlled = checked !== undefined;
  return (
    <div className="flex h-fit w-fit flex-row items-center gap-2 p-1.5">
      <Label className="text-body-s flex h-full cursor-pointer items-center gap-2">
        <SwitchRoot
          data-slot="toggle"
          className={cn(
            'peer focus-ring dark:data-[state=unchecked]:bg-input/50 inline-flex h-6 w-14 shrink-0 items-center rounded-full px-0.5 shadow-xs transition-all outline-none disabled:cursor-not-allowed disabled:opacity-40 data-[state=checked]:bg-brand data-[state=unchecked]:bg-neutral-400',
          )}
          disabled={disabled}
          {...(isControlled ? { checked } : { defaultChecked: false })}
          onCheckedChange={(newCheckedState) => {
            newCheckedState ? onCheckedOn?.() : onCheckedOff?.();
            onCheckedChange?.(newCheckedState);
          }}
        >
          <SwitchThumb
            data-slot="toggle-thumb"
            className={cn(
              'dark:data-[state=checked]:bg-background dark:data-[state=unchecked]:bg-foreground pointer-events-none block size-5 rounded-full bg-white ring-0 transition-transform data-[state=checked]:translate-x-8 data-[state=unchecked]:translate-x-0',
            )}
          />
        </SwitchRoot>
        {label}
      </Label>
    </div>
  );
}

export { Toggle };
