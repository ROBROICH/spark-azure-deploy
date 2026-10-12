import { Root, Indicator } from '@radix-ui/react-checkbox';
import { cn } from '@/features/ui/style/cn';
import { CheckIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { LAW_PICKER_CHECKBOX_CLASS_NAME } from './checkboxStyles';
import type { LawPickerNorm } from './legalBasisPicker.model';

type LawPickerNormRowProps = {
  norm: LawPickerNorm;
  checked: boolean;
  onToggle: (id: string) => void;
};

export const LawPickerNormRow = (props: LawPickerNormRowProps) => {
  const { norm, checked, onToggle } = props;
  const { t } = useTranslation('LegalBasisPicker');
  const unavailableHint = norm.unavailable ? t('unavailable') : undefined;

  return (
    <div className="flex min-h-8 w-full items-center gap-2 p-1">
      <div className="min-w-0 flex-1">
        <span
          className={cn(
            'block flex-1 py-[3px] pl-6 text-left text-[13px]',
            checked ? 'font-medium text-brand-950' : 'text-neutral-600',
          )}
        >
          {norm.label}
        </span>
        {unavailableHint ? (
          <span className="block pl-6 text-[11px] text-neutral-500">
            {unavailableHint}
          </span>
        ) : null}
      </div>

      <Root
        checked={checked}
        disabled={norm.unavailable === true && !checked}
        onCheckedChange={() => onToggle(norm.id)}
        aria-label={norm.label}
        className={LAW_PICKER_CHECKBOX_CLASS_NAME}
      >
        <Indicator className="grid place-content-center text-current">
          <CheckIcon className="size-4" />
        </Indicator>
      </Root>
    </div>
  );
};
