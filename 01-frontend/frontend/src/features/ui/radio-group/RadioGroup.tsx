import { cn } from '@/features/ui/style/cn';
import {
  Indicator as RadioGroupIndicator,
  Item as RadioGroupItemPrimitive,
  Root as RadioGroupRoot,
} from '@radix-ui/react-radio-group';
import { CircleIcon } from 'lucide-react';
import * as React from 'react';

function RadioGroup(props: React.ComponentProps<typeof RadioGroupRoot>) {
  const { className, ...radioGroupProps } = props;

  return (
    <RadioGroupRoot
      data-slot="radio-group"
      className={cn('grid gap-3', className)}
      {...radioGroupProps}
    />
  );
}

function RadioGroupItem(
  props: React.ComponentProps<typeof RadioGroupItemPrimitive>,
) {
  const { className, ...radioGroupItemProps } = props;

  return (
    <RadioGroupItemPrimitive
      data-slot="radio-group-item"
      className={cn(
        'focus-ring aspect-square size-6 shrink-0 rounded-full border border-border-form bg-white transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...radioGroupItemProps}
    >
      <RadioGroupIndicator
        data-slot="radio-group-indicator"
        className="relative flex items-center justify-center"
      >
        <CircleIcon className="absolute top-1/2 left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 fill-brand-950 text-brand-950" />
      </RadioGroupIndicator>
    </RadioGroupItemPrimitive>
  );
}

export { RadioGroup, RadioGroupItem };
