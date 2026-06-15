import { Accordion } from '@/features/ui/accordion/Accordion';
import { RiskWarningsAccordionSection } from './RiskWarningsAccordionSection';
import type { Risk } from './riskWarning.types';

type RiskWarningsAccordionProps = {
  open: Risk[];
  corrected: Risk[];
  ignored: Risk[];
};

export const RiskWarningsAccordion = (props: RiskWarningsAccordionProps) => {
  const { open, corrected, ignored } = props;

  return (
    <Accordion type="multiple" defaultValue={['open']}>
      <RiskWarningsAccordionSection value="open" risks={open} />

      <div className="my-2 border-t border-border-primary" />

      <RiskWarningsAccordionSection value="corrected" risks={corrected} />

      <div className="my-2 border-t border-border-primary" />

      <RiskWarningsAccordionSection value="ignored" risks={ignored} />
    </Accordion>
  );
};
