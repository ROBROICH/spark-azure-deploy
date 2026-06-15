import { Root, Indicator } from '@radix-ui/react-checkbox';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { cn } from '@/features/ui/style/cn';
import { CheckIcon, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getAvailableNormLabel,
  getAvailableNormText,
  type AvailableNormEntry,
} from '../../screen-data/useRechtsgrundlageData.helpers';
import { formatNormTextForDisplay } from '../NormTextView';
import { CHECKBOX_CLASS_NAME } from './checkboxStyles';

type NormRowProps = {
  norm: AvailableNormEntry;
  checked: boolean;
  onToggle: (normId: string) => void;
};

export const NormRow = (props: NormRowProps) => {
  const { norm, checked, onToggle } = props;
  const { t } = useTranslation('MvpRedesign');
  const normLabel = getAvailableNormLabel(norm);
  const normText = formatNormTextForDisplay(getAvailableNormText(norm));
  const checkboxLabel = checked
    ? t('RechtsgrundlageDialog.normCheckboxDeselectAriaLabel', {
        norm: normLabel,
      })
    : t('RechtsgrundlageDialog.normCheckboxSelectAriaLabel', {
        norm: normLabel,
      });

  return (
    <AccordionItem value={norm.norm.id} className="group/norm-item">
      <div className="flex h-8 w-full items-center gap-2 p-1">
        <div className="min-w-0 flex-1">
          <AccordionTrigger className="flex w-full items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-flex shrink-0 text-neutral-600 transition-transform duration-200 group-data-[state=open]/norm-item:rotate-90"
            >
              <ChevronRight className="size-4" />
            </span>

            <span
              className={cn(
                'flex-1 py-[3px] text-left text-[13px]',
                checked ? 'font-medium text-brand-950' : 'text-neutral-600',
              )}
            >
              {normLabel}
            </span>
          </AccordionTrigger>
        </div>

        <Root
          checked={checked}
          onCheckedChange={() => onToggle(norm.norm.id)}
          aria-label={checkboxLabel}
          className={CHECKBOX_CLASS_NAME}
        >
          <Indicator className="grid place-content-center text-current">
            <CheckIcon className="size-4" />
          </Indicator>
        </Root>
      </div>

      <AccordionContent className="px-[1px] pt-2 pl-[34px]">
        <p className="text-[13px] leading-[18px] whitespace-pre-line text-brand-950">
          {normText}
        </p>
      </AccordionContent>
    </AccordionItem>
  );
};
