import { cn } from '@/features/ui/style/cn';
import { Check, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type SplitButtonSize = 'sm' | 'md';

type SplitButtonProps = Omit<React.ComponentProps<'button'>, 'children'> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: SplitButtonSize;
  checkedLabel?: string;
  uncheckedLabel?: string;
  checkedIcon?: ReactNode;
  uncheckedIcon?: ReactNode;
};

const sizeStyles = {
  sm: {
    button: 'rounded-[4px]',
    text: 'px-2 py-[5px]',
    icon: 'p-1',
  },
  md: {
    button: 'rounded-lg',
    text: 'px-3 py-[9px]',
    icon: 'p-[4px]',
  },
} satisfies Record<
  SplitButtonSize,
  { button: string; text: string; icon: string }
>;

export function SplitButton(props: SplitButtonProps) {
  const {
    checked,
    onCheckedChange,
    size = 'sm',
    checkedLabel,
    uncheckedLabel,
    checkedIcon,
    uncheckedIcon,
    className,
    disabled,
    ...rest
  } = props;

  const { t } = useTranslation();
  const s = sizeStyles[size];

  const label = checked
    ? (checkedLabel ?? t('splitButton.checked'))
    : (uncheckedLabel ?? t('splitButton.unchecked'));
  const icon = checked
    ? (checkedIcon ?? <X className="size-4 shrink-0" />)
    : (uncheckedIcon ?? <Check className="size-4 shrink-0" />);

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={checked}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'focus-ring inline-flex cursor-pointer items-center overflow-hidden font-medium tracking-[0.22px] whitespace-nowrap transition-all disabled:pointer-events-none',
        'shadow-elevated',
        checked
          ? 'bg-green-800 text-white disabled:text-neutral-400'
          : 'bg-brand-950 text-white hover:bg-brand-800 active:bg-brand-800 disabled:text-neutral-400',
        s.button,
        className,
      )}
      {...rest}
    >
      <span className={cn('text-[11px] leading-[14px]', s.text)}>{label}</span>
      <span
        aria-hidden="true"
        className={cn(
          'flex items-center justify-center self-stretch border-l border-l-white/30',
          s.icon,
        )}
      >
        {icon}
      </span>
    </button>
  );
}
