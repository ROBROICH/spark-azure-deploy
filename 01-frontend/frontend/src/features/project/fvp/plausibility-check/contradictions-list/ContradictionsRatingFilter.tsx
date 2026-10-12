import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { InfoTooltip } from '@/features/ui/info-tooltip/InfoTooltip';
import { EXPECTED_MAX_NORMALIZED_RATING } from '../data/filtering/contradictionFilters';

const SLIDER_MAX_RATING = 100;
const SLIDER_STEP = 1;
const SLIDER_ACTIVE_COLOR = 'var(--effect-gradient-ai-text-icon-primary)';
const SLIDER_TRACK_COLOR = 'var(--neutral-100)';

const getIndicatorStyle = (fillPercentage: number) => {
  if (fillPercentage <= 10) {
    return { left: '0%', transform: 'translateX(0)' };
  }

  if (fillPercentage >= 90) {
    return { left: '100%', transform: 'translateX(-100%)' };
  }

  return { left: `${fillPercentage}%`, transform: 'translateX(-50%)' };
};

type ContradictionsRatingFilterProps = {
  disabled?: boolean;
  /** Kept for the toolbar contract; the bubble shows the threshold value only. */
  filteredCount?: number;
  totalCount: number;
  hasUsableRatings: boolean;
  minimumRating: number;
  ratingThreshold: number;
  onRatingThresholdChange: (value: number) => void;
};

/**
 * Owns the local slider/button mechanics while the parent toolbar owns the
 * route-backed search/filter state and threshold persistence.
 */
export const ContradictionsRatingFilter = (
  props: ContradictionsRatingFilterProps,
) => {
  const {
    disabled = false,
    totalCount,
    hasUsableRatings,
    minimumRating,
    ratingThreshold,
    onRatingThresholdChange,
  } = props;
  const { t } = useTranslation('PlausibilityCheck');
  const currentThreshold = Math.min(
    Math.max(ratingThreshold, minimumRating),
    EXPECTED_MAX_NORMALIZED_RATING,
  );
  const sliderMinimumValue = Math.round(minimumRating * 100);
  const sliderValue = Math.round(currentThreshold * 100);
  const sliderRange = SLIDER_MAX_RATING - sliderMinimumValue;
  const fillPercentage =
    sliderRange > 0
      ? ((sliderValue - sliderMinimumValue) / sliderRange) * 100
      : 100;
  const indicatorStyle = getIndicatorStyle(fillPercentage);
  const sliderBackground = `linear-gradient(to right, ${SLIDER_TRACK_COLOR} 0%, ${SLIDER_TRACK_COLOR} ${fillPercentage}%, ${SLIDER_ACTIVE_COLOR} ${fillPercentage}%, ${SLIDER_ACTIVE_COLOR} 100%)`;
  const isRatingFilterDisabled =
    disabled || totalCount === 0 || !hasUsableRatings;
  const canDecreaseRating =
    !isRatingFilterDisabled && sliderValue > sliderMinimumValue;
  const canIncreaseRating =
    !isRatingFilterDisabled && sliderValue < SLIDER_MAX_RATING;

  const adjustRatingThreshold = (delta: number) => {
    if (delta < 0 && !canDecreaseRating) {
      return;
    }

    if (delta > 0 && !canIncreaseRating) {
      return;
    }

    onRatingThresholdChange((sliderValue + delta) / 100);
  };

  return (
    <div
      className="flex h-8 w-[18rem] items-center gap-1 rounded-lg px-1 pl-3 text-slate-600"
      aria-disabled={isRatingFilterDisabled}
    >
      <div className="inline-flex shrink-0 items-center gap-1 text-[11px] leading-[14px] font-medium tracking-[0.02em] text-slate-600">
        <span>{t('ContradictionsToolbar.rating')}</span>
        <InfoTooltip
          ariaLabel={t('ContradictionsToolbar.ratingInfoLabel')}
          content={t('ContradictionsToolbar.ratingInfo')}
          className="size-4 text-slate-500"
          iconClassName="size-3.5"
        />
      </div>
      <button
        type="button"
        aria-label={t('ContradictionsToolbar.decreaseRating')}
        onClick={() => {
          adjustRatingThreshold(-SLIDER_STEP);
        }}
        disabled={!canDecreaseRating}
        className="focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center rounded p-1 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <div className="relative flex max-w-32 min-w-0 flex-1 items-center">
        <div
          className="pointer-events-none absolute bottom-full z-10 mb-2 min-w-max text-[11px] leading-none font-medium whitespace-nowrap text-slate-500 tabular-nums"
          style={indicatorStyle}
        >
          {sliderValue}
        </div>
        <input
          type="range"
          min={sliderMinimumValue}
          max={SLIDER_MAX_RATING}
          step={1}
          value={sliderValue}
          aria-label={t('ContradictionsToolbar.rating')}
          disabled={isRatingFilterDisabled}
          onChange={(event) => {
            onRatingThresholdChange(Number(event.currentTarget.value) / 100);
          }}
          onKeyDown={(event) => {
            if (event.key === '-' || event.key === '+') {
              event.preventDefault();
              adjustRatingThreshold(
                event.key === '-' ? -SLIDER_STEP : SLIDER_STEP,
              );
            }
          }}
          className="focus-ring h-2 w-full cursor-pointer appearance-none rounded-full border-[0.5px] border-slate-200 bg-transparent disabled:cursor-not-allowed disabled:opacity-60 [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-neutral-white [&::-moz-range-thumb]:bg-[var(--effect-gradient-ai-text-icon-primary)] [&::-moz-range-thumb]:shadow-sm [&::-moz-range-track]:h-2 [&::-moz-range-track]:rounded-full [&::-webkit-slider-runnable-track]:h-2 [&::-webkit-slider-runnable-track]:rounded-full [&::-webkit-slider-thumb]:mt-[-4px] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-neutral-white [&::-webkit-slider-thumb]:bg-[var(--effect-gradient-ai-text-icon-primary)] [&::-webkit-slider-thumb]:shadow-sm"
          style={{
            background: sliderBackground,
            accentColor: SLIDER_ACTIVE_COLOR,
          }}
        />
      </div>
      <button
        type="button"
        aria-label={t('ContradictionsToolbar.increaseRating')}
        onClick={() => {
          adjustRatingThreshold(SLIDER_STEP);
        }}
        disabled={!canIncreaseRating}
        className="focus-ring inline-flex shrink-0 cursor-pointer items-center justify-center rounded p-1 text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
};
