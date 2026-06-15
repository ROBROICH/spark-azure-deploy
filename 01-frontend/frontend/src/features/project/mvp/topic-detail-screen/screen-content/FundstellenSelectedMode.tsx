import { useGraphPerfReadyByKey } from '@/db/nodes/hooks/useGraphPerfDiagnostics';
import type { NodePayloadByType } from '@/db/nodes/types';
import { useTranslation } from 'react-i18next';
import { FundstellenStateMessage } from './FundstellenExplanation';
import { FundstellenSelectedReferenceCard } from './FundstellenSelectedReferenceCard';
import { FundstellenSwimlaneSkeleton } from '../fundstellen-swimlane/FundstellenSwimlaneSkeleton';
import type { FundstellenCardEntry } from './mvpFundstellenCardModels';
import { useFundstellenDocumentNormResult } from './useFundstellenSelectionResult';

const FundstellenSelectedModeContent = (props: {
  entries: FundstellenCardEntry[];
  selectedDocument: NodePayloadByType<'dokument'> | null;
  selectedDocumentId: string;
  selectedNormId: string;
}) => {
  const { entries, selectedDocument, selectedDocumentId, selectedNormId } =
    props;
  const { t } = useTranslation('MvpRedesign');

  useGraphPerfReadyByKey({
    name: 'mvp.fundstellen.selection.ready',
    enabled: true,
    key: `${selectedDocumentId}:${selectedNormId}`,
    detail: {
      entryCount: entries.length,
      selectedDocumentId,
      selectedNormId,
    },
  });

  if (entries.length === 0) {
    return (
      <FundstellenStateMessage>
        {t('FundstellenTabContent.noResults')}
      </FundstellenStateMessage>
    );
  }

  return (
    <FundstellenSelectedReferenceCard
      document={selectedDocument}
      entries={entries}
    />
  );
};

export const FundstellenSelectedModeLoader = (props: {
  selectedDocument: NodePayloadByType<'dokument'> | null;
  selectedDocumentId: string;
  selectedNormId: string;
}) => {
  const { selectedDocument, selectedDocumentId, selectedNormId } = props;
  const fundstellenSelection = useFundstellenDocumentNormResult({
    selectedDocumentId,
    selectedNormId,
  });

  if (fundstellenSelection.isLoading) {
    return <FundstellenSwimlaneSkeleton />;
  }

  return (
    <FundstellenSelectedModeContent
      entries={fundstellenSelection.entries}
      selectedDocument={selectedDocument}
      selectedDocumentId={selectedDocumentId}
      selectedNormId={selectedNormId}
    />
  );
};
