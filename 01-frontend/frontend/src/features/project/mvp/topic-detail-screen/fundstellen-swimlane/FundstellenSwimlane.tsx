import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useLiveNode } from '@/db/nodes/hooks/useLiveNodes';
import type { NodePayloadByType } from '@/db/nodes/types';
import { hasOutdatedNodeSummary } from '@/features/project/versioning/outdatedSummary';
import { useProjectVersionsNavigation } from '@/features/project/versioning/useProjectVersionsNavigation';
import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { AiOutdatedTriggerCard } from '@/features/ui/ai-outdated-trigger-card/AiOutdatedTriggerCard';
import { getRouteApi } from '@tanstack/react-router';
import { CircleHelp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { FundstellenContent } from '../screen-content/FundstellenContent';
import { FundstellenExplanation } from '../screen-content/FundstellenExplanation';
import { getNormSelectionLabel } from '../screen-content/fundstellenLabels';
import { useMvpNormRefreshAction } from '../screen-content/useMvpNormRefreshAction';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

type FundstellenSwimlaneProps = {
  topicDocuments: NodePayloadByType<'dokument'>[];
};

const FundstellenOutdatedTriggerCard = (props: { selectedNormId: string }) => {
  const { selectedNormId } = props;
  const { verfahrenId } = route.useParams();
  const { t } = useTranslation('MvpRedesign');
  const showProjectVersions = useProjectVersionsNavigation(verfahrenId);
  const refreshAction = useMvpNormRefreshAction(selectedNormId);

  return (
    <AiOutdatedTriggerCard
      className="mb-2"
      name="mvp-fundstellen-outdated-trigger"
      title={t('FundstellenOutdatedTrigger.title')}
      body={t('FundstellenOutdatedTrigger.body')}
      versionAction={{
        label: t('FundstellenOutdatedTrigger.showVersions'),
        onClick: showProjectVersions,
      }}
      refreshAction={{
        disabled: refreshAction.isRefreshDisabled,
        isLoading: refreshAction.isRefreshRunning,
        label: t('FundstellenOutdatedTrigger.refresh'),
        loadingLabel: t('FundstellenOutdatedTrigger.refreshLoading'),
        onClick: refreshAction.onRefresh,
      }}
    />
  );
};

const FundstellenOutdatedTrigger = (props: { selectedNormId: string }) => {
  const { selectedNormId } = props;
  const normRef = { id: selectedNormId, nodeType: 'norm' as const };
  const fundstelleRefs = useDescendants('fundstelle', normRef);
  const hasOutdatedFundstellen = hasOutdatedNodeSummary(fundstelleRefs);

  if (hasOutdatedFundstellen) {
    return <FundstellenOutdatedTriggerCard selectedNormId={selectedNormId} />;
  }

  return null;
};

/**
 * Keeps document and norm URL selections synchronized with the explanation,
 * outdated warning, and matching Fundstellen result mode.
 */
export const FundstellenSwimlane = (props: FundstellenSwimlaneProps) => {
  const { topicDocuments } = props;
  const { t } = useTranslation('MvpRedesign');
  const selectedDocumentId = route.useSearch({
    select: (search) => search.selectedDocumentId,
  });
  const selectedNormId = route.useSearch({
    select: (search) => search.selectedNormId,
  });
  const navigate = route.useNavigate();
  const selectedDocument =
    topicDocuments.find((document) => document.id === selectedDocumentId) ??
    null;
  const selectedNormRef = selectedNormId
    ? { id: selectedNormId, nodeType: 'norm' as const }
    : null;
  const { data: selectedNorm } = useLiveNode(selectedNormRef);
  const selectedGesetzRef = selectedNorm
    ? { id: selectedNorm.gesetzId, nodeType: 'gesetz' as const }
    : null;
  const { data: selectedGesetz } = useLiveNode(selectedGesetzRef);
  const selectedDocumentLabel =
    selectedDocument?.filename.split('/').pop() ?? selectedDocumentId ?? null;
  const selectedNormLabel = selectedNorm
    ? getNormSelectionLabel(selectedNorm, selectedGesetz?.jurabk ?? null)
    : (selectedNormId ?? null);
  const fundstellenSelection =
    selectedDocumentId && selectedNormId
      ? ({
          mode: 'documentAndNorm',
          documentLabel: selectedDocumentLabel ?? selectedDocumentId,
          normLabel: selectedNormLabel ?? selectedNormId,
        } as const)
      : selectedDocumentId
        ? ({
            mode: 'document',
            documentLabel: selectedDocumentLabel ?? selectedDocumentId,
          } as const)
        : selectedNormId
          ? ({
              mode: 'norm',
              normLabel: selectedNormLabel ?? selectedNormId,
            } as const)
          : ({ mode: 'empty' } as const);

  const handleClearDocument = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        selectedDocumentId: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const handleClearNorm = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        selectedNormId: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border-primary px-3 py-3">
        <div className="relative rounded-lg border border-blue-200 bg-blue-50 py-3 pr-8 pl-4 shadow-sm">
          <div className="pointer-events-none absolute top-2.5 right-2.5 z-10">
            <TooltipWrapper
              content={t('FundstellenTabContent.empty.line2')}
              side="top"
              align="end"
              className="max-w-80"
            >
              <span
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- tooltip trigger anchor; role="img" names the informational status icon while tabIndex makes the tooltip keyboard-reachable
                tabIndex={0}
                role="img"
                aria-label={t('FundstellenTabContent.infoAriaLabel')}
                className="focus-ring pointer-events-auto inline-flex rounded-full bg-blue-100/90 p-1 text-blue-700 ring-1 ring-blue-200/90 transition-colors hover:bg-blue-100 hover:text-blue-800"
              >
                <CircleHelp className="size-3.5" aria-hidden="true" />
              </span>
            </TooltipWrapper>
          </div>
          <FundstellenExplanation
            selection={fundstellenSelection}
            onClearDocument={handleClearDocument}
            onClearNorm={handleClearNorm}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {selectedNormId ? (
          <FundstellenOutdatedTrigger selectedNormId={selectedNormId} />
        ) : null}
        <FundstellenContent
          selectedDocumentId={selectedDocumentId}
          selectedNormId={selectedNormId}
          topicDocuments={topicDocuments}
        />
      </div>
    </div>
  );
};
