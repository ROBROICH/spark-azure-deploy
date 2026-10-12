import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { useTranslation } from 'react-i18next';
import { countCarryingFundstellen } from './fundstellenReliability';

type FundstellenFocusCountProps = {
  entries: ReadonlyArray<{ confidence?: number | null }>;
};

/**
 * States in the card header how many findings the search puts in focus. The
 * screen focuses exactly those that carry the assessment.
 *
 * "Fokus" claims only where to start, which is the one statement a ranking
 * signal can support: it can direct attention, but it cannot certify what a
 * passage holds or what it is worth.
 *
 * This is the proactive half of the presentation: it is readable without
 * opening the card, and it names the size of the whole result set, which the
 * truncated list of rows cannot. The trigger is a button because the header
 * renders outside any interactive row, so the explanation stays reachable by
 * keyboard.
 */
export const FundstellenFocusCount = (props: FundstellenFocusCountProps) => {
  const { entries } = props;
  const { t } = useTranslation('MvpRedesign');

  if (entries.length === 0) {
    return null;
  }

  const counts = {
    focused: countCarryingFundstellen(entries),
    total: entries.length,
  };

  return (
    <TooltipWrapper
      content={t('FundstellenReliability.focusCountExplanation', counts)}
      className="max-w-64"
      side="top"
      align="end"
    >
      <button
        type="button"
        className="focus-ring shrink-0 rounded-[4px] text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-500 transition-colors hover:text-slate-700"
      >
        {t('FundstellenReliability.focusCount', counts)}
      </button>
    </TooltipWrapper>
  );
};
