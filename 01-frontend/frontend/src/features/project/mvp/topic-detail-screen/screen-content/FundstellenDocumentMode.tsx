import { useDescendants } from '@/db/nodes/hooks/useDescendants';
import { useLiveNodes } from '@/db/nodes/hooks/useLiveNodes';
import type { NodePayloadByType } from '@/db/nodes/types';
import { useProjectVersionsNavigation } from '@/features/project/versioning/useProjectVersionsNavigation';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { getStoredParentRefByType } from '../storedParentRefs';
import { FundstellenStateMessage } from './FundstellenExplanation';
import { FundstellenNormGroupCard } from './FundstellenNormGroupCard';
import { FundstellenSwimlaneSkeleton } from '../fundstellen-swimlane/FundstellenSwimlaneSkeleton';
import { getNormSelectionLabel } from './fundstellenLabels';
import type { FundstellenNormGroupCardModel } from './mvpFundstellenCardModels';
import { useFundstellenDocumentResult } from './useFundstellenSelectionResult';
import { useMvpNormRefreshAction } from './useMvpNormRefreshAction';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

const hasTopicNormParent = (
  norm: NodePayloadByType<'norm'>,
  topicNormIds: ReadonlySet<string>,
) => {
  return norm.frontend_parent_ids.some((parentId) => {
    const parentRef = getStoredParentRefByType(parentId, 'topic_norm');

    return parentRef !== null && topicNormIds.has(parentRef.id);
  });
};

const createNodeMap = <T extends { id: string }>(nodes: T[]) => {
  return new Map(nodes.map((node) => [node.id, node]));
};

const FundstellenNormGroupCardWithRefresh = (props: {
  documentFileId?: string | null;
  documentId?: string | null;
  fundstellenNormGroupCard: FundstellenNormGroupCardModel;
  isExternal?: boolean;
  normLabel?: string | null;
}) => {
  const { verfahrenId } = route.useParams();
  const showProjectVersions = useProjectVersionsNavigation(verfahrenId);
  const refreshAction = useMvpNormRefreshAction(
    props.fundstellenNormGroupCard.normId,
  );

  return (
    <FundstellenNormGroupCard
      documentFileId={props.documentFileId}
      documentId={props.documentId}
      fundstellenNormGroupCard={props.fundstellenNormGroupCard}
      isExternal={props.isExternal}
      isRefreshDisabled={refreshAction.isRefreshDisabled}
      isRefreshRunning={refreshAction.isRefreshRunning}
      normLabel={props.normLabel}
      onRefresh={refreshAction.onRefresh}
      onShowVersions={showProjectVersions}
    />
  );
};

const FundstellenNormGroupCardWithWorkflow = (props: {
  documentFileId?: string | null;
  documentId?: string | null;
  fundstellenNormGroupCard: FundstellenNormGroupCardModel;
  isExternal?: boolean;
  normLabel?: string | null;
}) => {
  if (props.fundstellenNormGroupCard.hasOutdatedFundstellen) {
    return <FundstellenNormGroupCardWithRefresh {...props} />;
  }

  return (
    <FundstellenNormGroupCard
      documentFileId={props.documentFileId}
      documentId={props.documentId}
      fundstellenNormGroupCard={props.fundstellenNormGroupCard}
      isExternal={props.isExternal}
      normLabel={props.normLabel}
    />
  );
};

const FundstellenDocumentModeContent = (props: {
  fundstellenCards: FundstellenNormGroupCardModel[];
  selectedDocument: NodePayloadByType<'dokument'> | null;
}) => {
  const { fundstellenCards, selectedDocument } = props;
  const { topicName } = route.useParams();
  const { t } = useTranslation('MvpRedesign');
  const topicRef = { id: topicName, node_type: 'topic' as const };
  const topicNormRefs = useDescendants('topic_norm', topicRef);
  const topicNormIds = new Set(
    topicNormRefs.map((topicNormRef) => topicNormRef.id),
  );
  const documentCardNormRefs = Array.from(
    new Map(
      fundstellenCards.map((card) => [
        card.normId,
        { id: card.normId, node_type: 'norm' as const },
      ]),
    ).values(),
  );
  const { data: documentCardNorms } = useLiveNodes(documentCardNormRefs);
  const gesetzRefs = Array.from(
    new Map(
      documentCardNorms.map((norm) => [
        norm.gesetz_id,
        { id: norm.gesetz_id, node_type: 'gesetz' as const },
      ]),
    ).values(),
  );
  const { data: gesetzes } = useLiveNodes(gesetzRefs);
  const normById = createNodeMap(documentCardNorms);
  const gesetzJurabkById = new Map(
    gesetzes.map((gesetz) => [gesetz.id, gesetz.jurabk]),
  );
  const normLabelById = new Map(
    documentCardNorms.map((norm) => [
      norm.id,
      getNormSelectionLabel(norm, gesetzJurabkById.get(norm.gesetz_id) ?? null),
    ]),
  );
  const isTopicNormByResolvedNormId = new Map(
    documentCardNorms.map((norm) => [
      norm.id,
      hasTopicNormParent(norm, topicNormIds),
    ]),
  );
  const sortedDocumentCards = [...fundstellenCards].sort((left, right) => {
    const leftIsExternal = !isTopicNormByResolvedNormId.get(left.normId);
    const rightIsExternal = !isTopicNormByResolvedNormId.get(right.normId);

    if (leftIsExternal !== rightIsExternal) {
      return leftIsExternal ? 1 : -1;
    }

    return left.normId.localeCompare(right.normId, 'de');
  });

  if (sortedDocumentCards.length === 0) {
    return (
      <FundstellenStateMessage>
        {t('FundstellenTabContent.noResults')}
      </FundstellenStateMessage>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sortedDocumentCards.map((card) => (
        <FundstellenNormGroupCardWithWorkflow
          key={card.normId}
          documentId={selectedDocument?.id}
          documentFileId={selectedDocument?.dms_file_id}
          fundstellenNormGroupCard={card}
          normLabel={normLabelById.get(card.normId)}
          isExternal={
            normById.has(card.normId) &&
            !isTopicNormByResolvedNormId.get(card.normId)
          }
        />
      ))}
    </div>
  );
};

export const FundstellenDocumentModeLoader = (props: {
  selectedDocument: NodePayloadByType<'dokument'> | null;
  selectedDocumentId: string;
}) => {
  const { selectedDocument, selectedDocumentId } = props;
  const fundstellenSelection = useFundstellenDocumentResult(selectedDocumentId);

  if (fundstellenSelection.isLoading) {
    return <FundstellenSwimlaneSkeleton />;
  }

  return (
    <FundstellenDocumentModeContent
      fundstellenCards={fundstellenSelection.fundstellenCards}
      selectedDocument={selectedDocument}
    />
  );
};
