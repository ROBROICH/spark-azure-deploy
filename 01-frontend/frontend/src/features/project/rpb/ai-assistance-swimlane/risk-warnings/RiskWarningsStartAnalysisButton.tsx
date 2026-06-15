import { AiButton } from '@/features/ui/ai/AiButton';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import {
  type RiskWarningsStartAnalysisDisabledReason,
  type RiskWarningsStartAnalysisState,
  useRiskWarningsStartAnalysis,
} from './useRiskWarningsStartAnalysis';

const DISABLED_TOOLTIP_KEY_BY_REASON = {
  noPermission: 'riskWarnings.startAnalysis.tooltipDisabledNoPermission',
  noOutlineNode: 'riskWarnings.startAnalysis.tooltipDisabledNoOutlineNode',
  pendingBeschlussCommit:
    'riskWarnings.startAnalysis.tooltipDisabledPendingBeschlussCommit',
} as const satisfies Record<RiskWarningsStartAnalysisDisabledReason, string>;

type RiskWarningsStartAnalysisButtonProps = Pick<
  ComponentProps<typeof AiButton>,
  'className' | 'size' | 'tooltipAlign' | 'tooltipSide'
> & {
  labelKey?: string;
};

type RiskWarningsStartAnalysisButtonViewProps =
  RiskWarningsStartAnalysisButtonProps & {
    startAnalysis: RiskWarningsStartAnalysisState;
  };

export const RiskWarningsStartAnalysisButtonView = (
  props: RiskWarningsStartAnalysisButtonViewProps,
) => {
  const {
    className,
    labelKey = 'riskWarnings.startAnalysis.label',
    size = 'xs',
    startAnalysis,
    tooltipAlign,
    tooltipSide,
  } = props;
  const { t } = useTranslation('Rpb');
  const disabledTooltip = startAnalysis.disabledReason
    ? t(DISABLED_TOOLTIP_KEY_BY_REASON[startAnalysis.disabledReason])
    : undefined;

  return (
    <AiButton
      size={size}
      className={className}
      label={t(labelKey)}
      isLoading={startAnalysis.isRunning}
      isDisabled={startAnalysis.isDisabled}
      onClick={startAnalysis.start}
      enabledTooltip={t('riskWarnings.startAnalysis.tooltipEnabled')}
      disabledTooltip={disabledTooltip}
      tooltipAlign={tooltipAlign}
      tooltipSide={tooltipSide}
    />
  );
};

export const RiskWarningsStartAnalysisButton = (
  props: RiskWarningsStartAnalysisButtonProps,
) => {
  const startAnalysis = useRiskWarningsStartAnalysis();

  return (
    <RiskWarningsStartAnalysisButtonView
      {...props}
      startAnalysis={startAnalysis}
    />
  );
};
