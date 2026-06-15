import { AiOutdatedTriggerCard } from '@/features/ui/ai-outdated-trigger-card/AiOutdatedTriggerCard';
import { AiTriggerCard } from '@/features/ui/ai-trigger-card/AiTriggerCard';
import { InfoCard } from '@/features/ui/info-card/InfoCard';
import { useTranslation } from 'react-i18next';

export type AiBewertungTriggerState =
  | { type: 'procedural' }
  | { type: 'empty-success' }
  | {
      disabledTooltip?: string;
      isStartDisabled: boolean;
      onStart: () => void;
      type: 'empty' | 'progress';
    }
  | {
      disabledTooltip?: string;
      isRefreshDisabled: boolean;
      isRefreshRunning: boolean;
      onRefresh: () => void;
      onShowVersions: () => void;
      type: 'outdated';
    }
  | { type: 'success' };

type AiBewertungTriggerCardProps = {
  state: AiBewertungTriggerState;
};

/**
 * Renders the one Bewertung trigger variant selected by the parent resolver.
 */
export const AiBewertungTriggerCard = (props: AiBewertungTriggerCardProps) => {
  const { state } = props;
  const { t } = useTranslation('Rpb');

  switch (state.type) {
    case 'procedural':
      return (
        <InfoCard
          isCollapsible={false}
          title={t('aiAssistance.aiTrigger.proceduralNormNotChecked')}
          variant="warning"
        />
      );
    case 'empty-success':
      return (
        <AiTriggerCard
          name="rpb-bewertung-ai-trigger"
          status="success"
          title={t('aiAssistance.aiTrigger.emptySuccessTitle')}
          body={t('aiAssistance.aiTrigger.emptySuccessBody')}
        />
      );
    case 'empty':
    case 'progress':
      return (
        <AiTriggerCard
          name="rpb-bewertung-ai-trigger"
          status={state.type === 'progress' ? 'progress' : 'empty'}
          title={t(
            state.type === 'progress'
              ? 'aiAssistance.aiTrigger.progressTitle'
              : 'aiAssistance.aiTrigger.initialTitle',
          )}
          body={t(
            state.type === 'progress'
              ? 'aiAssistance.aiTrigger.progressBody'
              : 'aiAssistance.aiTrigger.initialBody',
          )}
          startActionLabel={t('aiAssistance.startAiAnalysis')}
          progressActionLabel={t('aiAssistance.startAiAnalysisLoading')}
          isStartDisabled={state.isStartDisabled}
          startDisabledTooltip={state.disabledTooltip}
          onStart={state.onStart}
        />
      );
    case 'outdated':
      return (
        <AiOutdatedTriggerCard
          name="rpb-bewertung-outdated-trigger"
          title={t(
            state.isRefreshRunning
              ? 'aiAssistance.aiOutdatedTrigger.progressTitle'
              : 'aiAssistance.aiOutdatedTrigger.title',
          )}
          body={t(
            state.isRefreshRunning
              ? 'aiAssistance.aiOutdatedTrigger.progressBody'
              : 'aiAssistance.aiOutdatedTrigger.body',
          )}
          versionAction={{
            label: t('aiAssistance.aiOutdatedTrigger.showVersions'),
            onClick: state.onShowVersions,
          }}
          refreshAction={{
            disabled: state.isRefreshDisabled,
            isLoading: state.isRefreshRunning,
            label: t('aiAssistance.aiOutdatedTrigger.refresh'),
            loadingLabel: t('aiAssistance.aiOutdatedTrigger.refreshLoading'),
            disabledTooltip: state.disabledTooltip,
            onClick: state.onRefresh,
          }}
        />
      );
    case 'success':
      return (
        <AiTriggerCard
          name="rpb-bewertung-ai-trigger"
          status="success"
          title={t('aiAssistance.aiTrigger.successTitle')}
          body={t('aiAssistance.aiTrigger.successBody')}
        />
      );
  }
};
