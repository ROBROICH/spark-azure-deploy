import type { NodePayloadByType } from '@/db/nodes/types';
import { LawChangeIndicatorView } from '@/features/project/law-changes/ui/LawChangeIndicator';
import type { LawChangeRecord } from '@/features/project/law-changes/data/lawChanges.types';
import { getRouteApi } from '@tanstack/react-router';

type NormCardLawChangeIndicatorProps = {
  lawChanges: LawChangeRecord[];
  topicNorm: NodePayloadByType<'topic_norm'>;
};

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

export const NormCardLawChangeIndicator = (
  props: NormCardLawChangeIndicatorProps,
) => {
  const navigate = route.useNavigate();
  const { lawChanges, topicNorm } = props;

  return (
    <LawChangeIndicatorView
      jurabk={topicNorm.jurabk}
      lawChanges={lawChanges}
      paragraphNr={topicNorm.paragraph_nr}
      onOpen={(lawChange) => {
        navigate({
          search: (prev) => ({
            ...prev,
            lawChangeId: lawChange.id,
          }),
          replace: true,
          resetScroll: false,
        });
      }}
    />
  );
};
