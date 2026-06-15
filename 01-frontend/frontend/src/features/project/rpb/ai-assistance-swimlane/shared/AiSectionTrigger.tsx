import type { ElementType } from 'react';
import {
  AccordionChevron,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { useTranslation } from 'react-i18next';

type AiSectionTriggerProps = {
  icon: ElementType;
  titleKey: string;
  count: number;
};

export function AiSectionTrigger(props: AiSectionTriggerProps) {
  const { icon: Icon, titleKey, count } = props;
  const { t } = useTranslation('Rpb');

  return (
    <AccordionTrigger className="flex h-[52px] w-full items-center gap-2">
      <span
        aria-hidden="true"
        className="shrink-0 rounded-lg bg-bg-quaternary p-1.5"
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 text-left text-[13px] font-medium tracking-[-0.13px] text-brand-950">
        {t(titleKey)} ({count})
      </span>
      <AccordionChevron className="text-content-secondary ml-auto" />
    </AccordionTrigger>
  );
}
