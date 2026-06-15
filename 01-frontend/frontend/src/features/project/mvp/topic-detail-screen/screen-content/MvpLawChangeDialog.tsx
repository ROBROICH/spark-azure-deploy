import { LawChangeDialogController } from '@/features/project/law-changes/ui/LawChangeDialogController';
import { getRouteApi } from '@tanstack/react-router';
import {
  getTopicNormLabel,
  type TopicNormEntry,
} from '../screen-data/useRechtsgrundlageData.helpers';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

type MvpLawChangeDialogProps = {
  lawChangeId?: string;
  selectedLawChangeNorm: TopicNormEntry | null;
};

export function MvpLawChangeDialog(props: MvpLawChangeDialogProps) {
  const { lawChangeId, selectedLawChangeNorm } = props;
  const navigate = route.useNavigate();

  return (
    <LawChangeDialogController
      lawChangeId={lawChangeId}
      normLabel={
        selectedLawChangeNorm
          ? getTopicNormLabel(selectedLawChangeNorm)
          : undefined
      }
      onOpenChange={(open) => {
        if (!open) {
          navigate({
            search: (prev) => ({
              ...prev,
              lawChangeId: undefined,
            }),
            replace: true,
            resetScroll: false,
          });
        }
      }}
      onSelectLawChangeId={(nextLawChangeId) => {
        navigate({
          search: (prev) => ({
            ...prev,
            lawChangeId: nextLawChangeId,
          }),
          replace: true,
          resetScroll: false,
        });
      }}
    />
  );
}
