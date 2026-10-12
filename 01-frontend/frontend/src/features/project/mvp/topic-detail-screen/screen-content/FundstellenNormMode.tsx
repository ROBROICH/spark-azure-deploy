import { useLiveNodes } from '@/db/nodes/hooks/useLiveNodes';
import { useProjectVersionsNavigation } from '@/features/project/versioning/useProjectVersionsNavigation';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { FundstellenDocumentGroupCard } from './FundstellenDocumentGroupCard';
import { FundstellenStateMessage } from './FundstellenExplanation';
import { FundstellenSwimlaneSkeleton } from '../fundstellen-swimlane/FundstellenSwimlaneSkeleton';
import type { FundstellenDocumentGroupCardModel } from './mvpFundstellenCardModels';
import { useFundstellenNormResult } from './useFundstellenSelectionResult';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

const createNodeMap = <T extends { id: string }>(nodes: T[]) => {
  return new Map(nodes.map((node) => [node.id, node]));
};

const FundstellenNormModeContent = (props: {
  fundstellenCards: FundstellenDocumentGroupCardModel[];
  topicDocumentIds: ReadonlySet<string>;
}) => {
  const { fundstellenCards, topicDocumentIds } = props;
  const { verfahrenId } = route.useParams();
  const { t } = useTranslation('MvpRedesign');
  const showProjectVersions = useProjectVersionsNavigation(verfahrenId);
  const documentRefs = Array.from(
    new Map(
      fundstellenCards.map((card) => [
        card.documentId,
        { id: card.documentId, nodeType: 'dokument' as const },
      ]),
    ).values(),
  );
  const { data: documents } = useLiveNodes(documentRefs);
  const documentById = createNodeMap(documents);
  const sortedNormCards = [...fundstellenCards].sort((left, right) => {
    const leftIsExternal = !topicDocumentIds.has(left.documentId);
    const rightIsExternal = !topicDocumentIds.has(right.documentId);

    if (leftIsExternal !== rightIsExternal) {
      return leftIsExternal ? 1 : -1;
    }

    return left.documentId.localeCompare(right.documentId, 'de');
  });

  if (sortedNormCards.length === 0) {
    return (
      <FundstellenStateMessage>
        {t('FundstellenTabContent.noResults')}
      </FundstellenStateMessage>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {sortedNormCards.map((card) => (
        <FundstellenDocumentGroupCard
          key={card.documentId}
          documentFileId={documentById.get(card.documentId)?.dmsFileId}
          documentLabel={documentById
            .get(card.documentId)
            ?.filename.split('/')
            .pop()}
          fundstellenDocumentGroupCard={card}
          isExternal={!topicDocumentIds.has(card.documentId)}
          onShowVersions={showProjectVersions}
        />
      ))}
    </div>
  );
};

export const FundstellenNormModeLoader = (props: {
  selectedNormId: string;
  topicDocumentIds: ReadonlySet<string>;
}) => {
  const { selectedNormId, topicDocumentIds } = props;
  const fundstellenSelection = useFundstellenNormResult(selectedNormId);

  if (fundstellenSelection.isLoading) {
    return <FundstellenSwimlaneSkeleton />;
  }

  return (
    <FundstellenNormModeContent
      fundstellenCards={fundstellenSelection.fundstellenCards}
      topicDocumentIds={topicDocumentIds}
    />
  );
};
