import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getFundstellenReliabilityLevel } from './fundstellenReliability';

type FundstellenNotInFocusHintProps = {
  confidence?: number | null;
};

/**
 * Marks a finding the search did not put in focus, and explains on demand why.
 *
 * The wording names where to start rather than what the passage is. The
 * signal grades how far a passage carries the assessment of one legal element,
 * so the same passage can matter for one sentence of a norm and not for the
 * next — an adjective on the row would claim a property the finding does not
 * have on its own.
 *
 * Only the weaker case is marked, so the mark reads as a deviation rather than
 * as a grade on every row.
 *
 * The trigger is a span rather than a button because this renders inside the
 * row's own link, which may not nest an interactive element. Hover opens the
 * tooltip; the accessible name carries the same statement for anyone who
 * cannot reach it that way.
 */
export const FundstellenNotInFocusHint = (
  props: FundstellenNotInFocusHintProps,
) => {
  const { t } = useTranslation('MvpRedesign');
  const level = getFundstellenReliabilityLevel(props.confidence);

  if (level === 'carries') {
    return null;
  }

  const explanation = t(
    level === undefined
      ? 'FundstellenReliability.unratedExplanation'
      : 'FundstellenReliability.notInFocusExplanation',
  );

  return (
    <TooltipWrapper
      content={explanation}
      className="max-w-64"
      side="top"
      align="start"
    >
      <span
        role="img"
        aria-label={explanation}
        className="inline-flex shrink-0 items-center justify-center text-slate-400"
      >
        <Info className="size-3.5" aria-hidden="true" />
      </span>
    </TooltipWrapper>
  );
};
