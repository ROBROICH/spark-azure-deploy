import { useDescendantNodes } from '@/db/nodes/hooks/useDescendantNodes';
import { useNode } from '@/db/nodes/hooks/useNodes';
import type { NodePayloadByType } from '@/db/nodes/types';
import type { LawChangeRecord } from '@/features/project/law-changes/data/lawChanges.types';
import type { TopicNormEntry } from '../screen-data/useRechtsgrundlageData.helpers';
import { NormTextView } from './NormTextView';

export const ResolvedNormTextView = (props: {
  canMutateTopic: boolean;
  detailDocumentId: string;
  lawChanges: LawChangeRecord[];
  onBack: () => void;
  onToggleReviewed: (topicNorm: NodePayloadByType<'topic_norm'>) => void;
}) => {
  const {
    canMutateTopic,
    detailDocumentId,
    lawChanges,
    onBack,
    onToggleReviewed,
  } = props;
  const selectedTopicNormRef = {
    id: detailDocumentId,
    nodeType: 'topic_norm' as const,
  };
  const { data: selectedTopicNorm } = useNode(selectedTopicNormRef);
  const { data: resolvedNorms } = useDescendantNodes(
    'norm',
    selectedTopicNormRef,
  );
  const resolvedNorm = resolvedNorms.at(0) ?? null;
  const selectedGesetzRef = resolvedNorm
    ? { id: resolvedNorm.gesetzId, nodeType: 'gesetz' as const }
    : null;
  const { data: selectedGesetz } = useNode(selectedGesetzRef);
  const selectedNorm = selectedTopicNorm
    ? ({
        topicNorm: selectedTopicNorm,
        norm: resolvedNorm,
        gesetz: selectedGesetz ?? null,
      } satisfies TopicNormEntry)
    : null;

  if (!selectedNorm) {
    return null;
  }

  return (
    <NormTextView
      selectedNorm={selectedNorm}
      canMutateTopic={canMutateTopic}
      lawChanges={lawChanges}
      onBack={onBack}
      onToggleReviewed={onToggleReviewed}
    />
  );
};
