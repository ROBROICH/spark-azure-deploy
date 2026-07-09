import { Root, Indicator } from '@radix-ui/react-checkbox';
import { cn } from '@/features/ui/style/cn';
import { CheckIcon } from 'lucide-react';
import {
  getAvailableNormLabel,
  type AvailableNormEntry,
} from '../../screen-data/useRechtsgrundlageData.helpers';
import { CHECKBOX_CLASS_NAME } from './checkboxStyles';

type NormRowProps = {
  norm: AvailableNormEntry;
  checked: boolean;
  onToggle: (selectionKey: string) => void;
};

export const NormRow = (props: NormRowProps) => {
  const { norm, checked, onToggle } = props;
  const normLabel = getAvailableNormLabel(norm);

  return (
    <div className="flex h-8 w-full items-center gap-2 p-1">
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            'block flex-1 py-[3px] pl-6 text-left text-[13px]',
            checked ? 'font-medium text-brand-950' : 'text-neutral-600',
          )}
        >
          {normLabel}
        </span>
      </div>

      <Root
        checked={checked}
        onCheckedChange={() => onToggle(norm.selectionKey)}
        aria-label={normLabel}
        className={CHECKBOX_CLASS_NAME}
      >
        <Indicator className="grid place-content-center text-current">
          <CheckIcon className="size-4" />
        </Indicator>
      </Root>
    </div>
  );
};
