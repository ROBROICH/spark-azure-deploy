import { useTranslation } from 'react-i18next';
import {
  AccordionChevron,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { RiskWarningCard } from './RiskWarningCard';
import type { Risk } from './riskWarning.types';

type RiskWarningsAccordionSectionProps = {
  value: 'open' | 'corrected' | 'ignored';
  risks: Risk[];
};

export const RiskWarningsAccordionSection = (
  props: RiskWarningsAccordionSectionProps,
) => {
  const { value, risks } = props;
  const { t } = useTranslation('Rpb');
  const label = t(`riskWarnings.sections.${value}`);

  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="flex w-full items-center gap-2 px-2 py-2 text-left">
        <span className="text-[13px] font-medium">{label}</span>
        <span className="text-[13px] text-slate-600">({risks.length})</span>
        <AccordionChevron className="ml-auto" />
      </AccordionTrigger>
      <AccordionContent className="flex flex-col gap-2 px-2 py-2">
        {risks.map((risk) => (
          <RiskWarningCard key={risk.id} risk={risk} />
        ))}
      </AccordionContent>
    </AccordionItem>
  );
};
