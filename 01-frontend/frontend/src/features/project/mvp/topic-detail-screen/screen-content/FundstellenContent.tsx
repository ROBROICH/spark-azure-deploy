import type { NodePayloadByType } from '@/db/nodes/types';
import { useTranslation } from 'react-i18next';
import { FundstellenDocumentModeLoader } from './FundstellenDocumentMode';
import { FundstellenStateMessage } from './FundstellenExplanation';
import { FundstellenNormModeLoader } from './FundstellenNormMode';
import { FundstellenSelectedModeLoader } from './FundstellenSelectedMode';

type FundstellenContentProps = {
  selectedDocumentId?: string;
  selectedNormId?: string;
  topicDocuments: NodePayloadByType<'dokument'>[];
};

export const FundstellenContent = (props: FundstellenContentProps) => {
  const { selectedDocumentId, selectedNormId, topicDocuments } = props;
  const { t } = useTranslation('MvpRedesign');
  const selectedDocument =
    topicDocuments.find((document) => document.id === selectedDocumentId) ??
    null;
  const topicDocumentIds = new Set(
    topicDocuments.map((document) => document.id),
  );

  if (selectedDocumentId && selectedNormId) {
    return (
      <FundstellenSelectedModeLoader
        selectedDocument={selectedDocument}
        selectedDocumentId={selectedDocumentId}
        selectedNormId={selectedNormId}
      />
    );
  }

  if (selectedDocumentId) {
    return (
      <FundstellenDocumentModeLoader
        selectedDocument={selectedDocument}
        selectedDocumentId={selectedDocumentId}
      />
    );
  }

  if (selectedNormId) {
    return (
      <FundstellenNormModeLoader
        selectedNormId={selectedNormId}
        topicDocumentIds={topicDocumentIds}
      />
    );
  }

  return (
    <FundstellenStateMessage>
      {t('FundstellenTabContent.emptyStateCta')}
    </FundstellenStateMessage>
  );
};
