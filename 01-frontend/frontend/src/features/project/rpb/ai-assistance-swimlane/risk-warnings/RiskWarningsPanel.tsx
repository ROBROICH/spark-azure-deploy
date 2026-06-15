import { getRouteApi } from '@tanstack/react-router';
import { useCallback } from 'react';
import { getDescendantNodeRefsByType } from '@/db/nodes/examinationGraphModel';
import { useGraph } from '@/db/nodes/hooks/useGraph';
import { useLiveNodes } from '@/db/nodes/hooks/useLiveNodes';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { useHasTopicMutationRights } from '@/features/access-control/topic-permissions/hasTopicMutationRights';
import { useAction } from '@/db/nodes/hooks/useAction';
import { useRpbVaeNodeUrlState } from '../../workspace-state/RpbOutlineContext';
import { RiskWarningsAccordion } from './RiskWarningsAccordion';
import { RiskWarningsEmptyStateCard } from './RiskWarningsEmptyStateCard';
import { RiskWarningsLaneHeader } from './RiskWarningsLaneHeader';
import { getActiveRisks } from './riskFilters';
import { RiskWarningsMutationProvider } from './RiskWarningsMutationContext';
import type { Risk, RiskStatus } from './riskWarning.types';
import { useRiskWarningsStartAnalysis } from './useRiskWarningsStartAnalysis';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');

/**
 * Partition risk payloads into the three accordion sections rendered by the
 * Risikohinweise panel, dropping soft-deleted entries.
 *
 * @param risks Risk node payloads loaded from the graph.
 * @returns Lists keyed by display section: `open`, `corrected`, `ignored`.
 */
export const partitionRisksByStatus = (risks: Risk[]) => {
  const active = getActiveRisks(risks);

  return {
    open: active.filter((risk) => risk.status === 'open'),
    corrected: active.filter((risk) => risk.status === 'corrected'),
    ignored: active.filter((risk) => risk.status === 'ignored'),
  };
};

/**
 * Renders the Risikohinweise swimlane: a header with the back link and a
 * Start-AI-analysis button, plus three accordion sections grouping risks by
 * status. Mutations and workflow starts are gated by topic rights for topic-owned
 * `vae_node`s and by project mutation rights for intentional no-topic nodes.
 */
export const RiskWarningsPanel = () => {
  const { verfahrenId } = route.useParams();
  const routeOutlineNodeId = route.useSearch({
    select: (search) => search.outlineNodeId,
  });
  const { index } = useGraph();
  const { selectedVaeNode, selectedVaeNodeId, selectedVaeNodeMutationTopicId } =
    useRpbVaeNodeUrlState();
  const hasResolvedRouteOutlineSelection = Boolean(
    routeOutlineNodeId && selectedVaeNode,
  );
  const selectedRiskRefs = hasResolvedRouteOutlineSelection
    ? getDescendantNodeRefsByType(index, selectedVaeNodeId, 'risks')
    : [];
  const { data: selectedRisks } = useLiveNodes(selectedRiskRefs);
  const { transact, update } = useAction();
  const { canMutateProject } = useCanMutateProject({ requiredLevel: 'user' });
  const hasTopicMutationRights = useHasTopicMutationRights();
  const startAnalysis = useRiskWarningsStartAnalysis();
  const topicIdByVaeNodeId = selectedVaeNode
    ? new Map([[selectedVaeNode.id, selectedVaeNodeMutationTopicId]])
    : new Map<string, string | null | undefined>();

  // eslint-disable-next-line no-restricted-syntax -- this callback is exposed through context and needs stable identity to avoid broad risk-card consumer churn
  const handleStatusChange = useCallback(
    (risk: Risk, nextStatus: RiskStatus) => {
      transact(() => {
        update(risk, (draft) => {
          draft.status = nextStatus;
        });
      });
    },
    [transact, update],
  );

  const { open, corrected, ignored } = partitionRisksByStatus(selectedRisks);
  const hasRisks = open.length + corrected.length + ignored.length > 0;
  const hasSelectedVaeNode = hasResolvedRouteOutlineSelection;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <RiskWarningsLaneHeader
        verfahrenId={verfahrenId}
        showStartAnalysisButton={hasSelectedVaeNode && hasRisks}
        startAnalysis={startAnalysis}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {hasRisks ? (
          <RiskWarningsMutationProvider
            canMutateProject={canMutateProject}
            hasTopicMutationRights={hasTopicMutationRights}
            onStatusChange={handleStatusChange}
            topicIdByVaeNodeId={topicIdByVaeNodeId}
          >
            <RiskWarningsAccordion
              open={open}
              corrected={corrected}
              ignored={ignored}
            />
          </RiskWarningsMutationProvider>
        ) : (
          <RiskWarningsEmptyStateCard
            startAnalysis={startAnalysis}
            variant={hasSelectedVaeNode ? 'selected' : 'noSelection'}
          />
        )}
      </div>
    </div>
  );
};
