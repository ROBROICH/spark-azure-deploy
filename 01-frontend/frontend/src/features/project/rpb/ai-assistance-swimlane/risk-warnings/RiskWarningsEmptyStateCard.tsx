import { AiTriggerCard } from '@/features/ui/ai-trigger-card/AiTriggerCard';
import { useTranslation } from 'react-i18next';
import type { RiskWarningsStartAnalysisState } from './useRiskWarningsStartAnalysis';

type RiskWarningsEmptyStateCardProps = {
  startAnalysis: RiskWarningsStartAnalysisState;
  variant: 'selected' | 'noSelection';
};

export const RiskWarningsEmptyStateCard = (
  props: RiskWarningsEmptyStateCardProps,
) => {
  const { startAnalysis, variant } = props;
  const { t } = useTranslation('Rpb');
  const status = startAnalysis.isRunning ? 'progress' : 'empty';
  const isSelectedVariant = variant === 'selected';
  const titleKey = isSelectedVariant
    ? 'riskWarnings.emptyState.title'
    : 'riskWarnings.emptyState.noSelectionTitle';
  const bodyKey = isSelectedVariant
    ? 'riskWarnings.emptyState.body'
    : 'riskWarnings.emptyState.noSelectionBody';

  return (
    <AiTriggerCard
      name="rpb-risk-warnings-empty-state"
      status={status}
      title={t(
        startAnalysis.isRunning
          ? 'riskWarnings.emptyState.progressTitle'
          : titleKey,
      )}
      collapsedTitle={t('riskWarnings.emptyState.progressCollapsedTitle')}
      body={t(
        startAnalysis.isRunning
          ? 'riskWarnings.emptyState.progressBody'
          : bodyKey,
      )}
      startActionLabel={
        isSelectedVariant ? t('riskWarnings.startAnalysis.label') : undefined
      }
      progressActionLabel={t('riskWarnings.emptyState.progressActionLabel')}
      isStartDisabled={startAnalysis.isDisabled}
      onStart={startAnalysis.start}
    />
  );
};
