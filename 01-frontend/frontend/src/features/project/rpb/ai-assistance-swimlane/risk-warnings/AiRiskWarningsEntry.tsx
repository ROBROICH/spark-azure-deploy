import { getRouteApi, Link } from '@tanstack/react-router';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getDescendantNodeRefsByType } from '@/db/nodes/examinationGraphModel';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useLiveNodes } from '@/db/nodes/hooks/useLiveNodes';
import { useRpbVaeNodeUrlState } from '../../workspace-state/RpbOutlineContext';
import { getActiveRisks } from './riskFilters';
import { RiskWarningsStartAnalysisButton } from './RiskWarningsStartAnalysisButton';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

// Intentionally mirrors the AiSectionTrigger visual while keeping the lane link
// separate from the AI action button.
export const AiRiskWarningsEntry = () => {
  const { verfahrenId } = route.useParams();
  const routeOutlineNodeId = route.useSearch({
    select: (search) => search.outlineNodeId,
  });
  const { t } = useTranslation('Rpb');
  const { index } = useGraph();
  const { selectedVaeNode, selectedVaeNodeId } = useRpbVaeNodeUrlState();
  const hasResolvedRouteOutlineSelection = Boolean(
    routeOutlineNodeId && selectedVaeNode,
  );
  const selectedRiskRefs = hasResolvedRouteOutlineSelection
    ? getDescendantNodeRefsByType(index, selectedVaeNodeId, 'risks')
    : [];
  const { data: selectedRisks } = useLiveNodes(selectedRiskRefs);
  const activeSelectedRisks = getActiveRisks(selectedRisks);
  const count = activeSelectedRisks.filter(
    (risk) => risk.status === 'open',
  ).length;
  const startAnalysisLabelKey =
    activeSelectedRisks.length > 0
      ? 'riskWarnings.startAnalysis.retryLabel'
      : 'riskWarnings.startAnalysis.label';

  return (
    <div className="flex h-[52px] w-full items-center gap-2 border-t border-border-primary">
      <Link
        to="/verfahren/$verfahrenId/rpb"
        params={{ verfahrenId }}
        search={(prev) => ({ ...prev, aiLane: 'risikohinweise' as const })}
        className="focus-ring flex min-w-0 flex-1 items-center gap-2"
      >
        <span
          aria-hidden="true"
          className="shrink-0 rounded-lg bg-bg-quaternary p-1.5"
        >
          <AlertTriangle className="size-4" />
        </span>
        <span className="min-w-0 flex-1 truncate text-left text-[13px] font-medium tracking-[-0.13px] text-brand-950">
          {t('riskWarnings.entryRow')} ({count})
        </span>
      </Link>
      {count === 0 && hasResolvedRouteOutlineSelection ? (
        <RiskWarningsStartAnalysisButton
          className="shrink-0"
          labelKey={startAnalysisLabelKey}
        />
      ) : null}
      <ChevronRight
        aria-hidden="true"
        className="text-content-secondary size-4 shrink-0"
      />
    </div>
  );
};
