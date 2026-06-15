import { AiSparklesChip } from '@/features/ui/ai/AiSparklesChip';
import {
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/features/ui/accordion/Accordion';
import { ChevronDown } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

export const sectionBodyTextClassName =
  'text-[13px] leading-[18px] font-normal tracking-[-0.13px] text-brand-950 whitespace-pre-line';
export const sectionEyebrowClassName =
  'text-[11px] leading-[14px] font-medium tracking-[0.22px] text-slate-600';
export const sectionCardTitleClassName =
  'text-[11px] leading-[14px] font-medium tracking-[0.22px] text-slate-700';
export const sectionBadgeClassName =
  'rounded-[4px] border border-slate-400 bg-white px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-600';
export const sentenceTitleClassName =
  'text-[16px] leading-[20px] font-medium tracking-[-0.16px] text-brand-950';
export const sentenceTextClassName =
  'text-[13px] leading-[18px] font-normal tracking-[-0.13px] text-brand-950';

type RechtsmethodikSectionHeaderProps = {
  title: string;
};

const RechtsmethodikSectionHeader = (
  props: RechtsmethodikSectionHeaderProps,
) => {
  const { title } = props;

  return (
    <div className="flex items-center gap-2">
      <AiSparklesChip size="sm" aria-hidden="true" />
      <p className={sectionEyebrowClassName}>{title}</p>
    </div>
  );
};

type RechtsmethodikAccordionSectionProps = {
  children: ReactNode;
  title: string;
  value: string;
};

export const RechtsmethodikAccordionSection = (
  props: RechtsmethodikAccordionSectionProps,
) => {
  const { children, title, value } = props;

  return (
    <AccordionItem value={value} className="border-t border-border-primary">
      <AccordionTrigger className="focus-ring flex w-full items-center gap-2 rounded-sm py-4 text-left">
        <RechtsmethodikSectionHeader title={title} />
        <span className="ml-auto inline-flex shrink-0 rounded-sm p-1 text-slate-600">
          <ChevronDown className="size-4" aria-hidden="true" />
        </span>
      </AccordionTrigger>
      <AccordionContent className="pb-4">{children}</AccordionContent>
    </AccordionItem>
  );
};

type ExpandableSectionTextProps = {
  collapsedLines?: 2 | 3 | 4;
  text: string;
  textClassName: string;
  toggleThreshold?: number;
};

export const ExpandableSectionText = (props: ExpandableSectionTextProps) => {
  const {
    collapsedLines = 2,
    text,
    textClassName,
    toggleThreshold = 140,
  } = props;
  const { t } = useTranslation('Rpb');
  // eslint-disable-next-line no-restricted-syntax -- expanded/collapsed text is local presentation-only state for this card.
  const [isExpanded, setIsExpanded] = useState(false);
  const canToggle = text.trim().length > toggleThreshold;
  const clampClassName =
    collapsedLines === 2
      ? 'line-clamp-2'
      : collapsedLines === 3
        ? 'line-clamp-3'
        : 'line-clamp-4';

  return (
    <div className="min-w-0">
      <p
        className={[
          textClassName,
          !isExpanded && canToggle ? clampClassName : null,
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {text}
      </p>
      {canToggle ? (
        <button
          type="button"
          className="focus-ring mt-1 rounded-sm text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-700"
          aria-expanded={isExpanded}
          onClick={() => {
            setIsExpanded((prev) => !prev);
          }}
        >
          {isExpanded ? t('aiAssistance.showLess') : t('aiAssistance.showMore')}
        </button>
      ) : null}
    </div>
  );
};
