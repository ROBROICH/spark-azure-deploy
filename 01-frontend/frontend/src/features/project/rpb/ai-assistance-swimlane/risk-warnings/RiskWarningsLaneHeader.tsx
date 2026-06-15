import { Link } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/features/ui/button/Button';
import { Swimlanes } from '@/features/ui/swimlanes/Swimlanes';
import { RiskWarningsStartAnalysisButtonView } from './RiskWarningsStartAnalysisButton';
import type { RiskWarningsStartAnalysisState } from './useRiskWarningsStartAnalysis';

type RiskWarningsLaneHeaderProps = {
  showStartAnalysisButton: boolean;
  verfahrenId: string;
  startAnalysis: RiskWarningsStartAnalysisState;
};

export const RiskWarningsLaneHeader = (props: RiskWarningsLaneHeaderProps) => {
  const { showStartAnalysisButton, startAnalysis, verfahrenId } = props;
  const { t } = useTranslation('Rpb');

  return (
    <Swimlanes.HeaderPortal>
      <div className="flex h-full flex-1 items-center gap-2">
        <Button
          asChild
          variant="secondary"
          size="sm"
          iconOnly
          aria-label={t('riskWarnings.backAria')}
        >
          <Link
            to="/verfahren/$verfahrenId/rpb"
            params={{ verfahrenId }}
            search={(prev) => ({ ...prev, aiLane: undefined })}
            replace
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
        </Button>
        <span className="flex-1 text-[13px] font-medium">
          {t('riskWarnings.laneTitle')}
        </span>
        {showStartAnalysisButton ? (
          <RiskWarningsStartAnalysisButtonView
            className="ml-auto"
            labelKey="riskWarnings.startAnalysis.retryLabel"
            startAnalysis={startAnalysis}
          />
        ) : null}
      </div>
    </Swimlanes.HeaderPortal>
  );
};
