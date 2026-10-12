import { LawChangeIndicatorView } from '@/features/project/law-changes/ui/LawChangeIndicator';
import type { LawChangeRecord } from '@/features/project/law-changes/data/lawChanges.types';
import { Button } from '@/features/ui/button/Button';
import { SplitButton } from '@/features/ui/button/SplitButton';
import { getRouteApi } from '@tanstack/react-router';
import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getTopicNormLabel,
  getTopicNormParagraphRef,
  getTopicNormText,
  isTopicNormChecked,
  type TopicNormEntry,
} from '../screen-data/useRechtsgrundlageData.helpers';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

type NormTextViewProps = {
  canMutateTopic: boolean;
  lawChanges: LawChangeRecord[];
  selectedNorm: TopicNormEntry;
  onBack: () => void;
  onToggleReviewed: (topicNorm: TopicNormEntry['topicNorm']) => void;
};

// The backend currently emits generated definition-list text for legal lists:
//
// 1.
// :   generated list item text ...
//
// For display, keep the list marker and remove only that generated colon line.
const GENERATED_DEFINITION_LIST_MARKER =
  /(^|\n)([ \t]*(?:\d+\.|[a-z]\))[ \t]*)\r?\n[ \t]*:[ \t]*/g;

export const formatNormTextForDisplay = (text: string) => {
  return text.replaceAll(GENERATED_DEFINITION_LIST_MARKER, '$1$2 ');
};

export const NormTextView = (props: NormTextViewProps) => {
  const { canMutateTopic, lawChanges, selectedNorm, onBack, onToggleReviewed } =
    props;
  const { t } = useTranslation('MvpRedesign');
  const navigate = route.useNavigate();
  const isReviewed = isTopicNormChecked(selectedNorm.topicNorm);
  const normText = formatNormTextForDisplay(getTopicNormText(selectedNorm));

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border-primary px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          iconOnly
          aria-label={t('NormTextView.backAriaLabel')}
          onClick={onBack}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
        </Button>
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#1E1D49]">
          {selectedNorm.gesetz?.jurabk ?? selectedNorm.topicNorm.jurabk}{' '}
          {getTopicNormParagraphRef(selectedNorm)}
        </span>
        <LawChangeIndicatorView
          jurabk={selectedNorm.topicNorm.jurabk}
          lawChanges={lawChanges}
          paragraphNr={selectedNorm.topicNorm.paragraphNr}
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
        <SplitButton
          checked={isReviewed}
          disabled={!canMutateTopic}
          size="md"
          uncheckedLabel={t('NormTextView.pruefen')}
          checkedLabel={t('NormTextView.geprueft')}
          onCheckedChange={() => onToggleReviewed(selectedNorm.topicNorm)}
        />
      </div>

      <div
        className="focus-ring min-h-0 flex-1 overflow-y-auto p-4"
        role="region"
        aria-label={t('NormTextView.normTextRegionAriaLabel')}
        tabIndex={0}
      >
        <h2 className="mb-4 text-[15px] font-semibold text-[#1E1D49]">
          {getTopicNormLabel(selectedNorm)}
        </h2>
        <div className="text-[13px] leading-relaxed whitespace-pre-line text-text-secondary">
          {normText}
        </div>
      </div>
    </div>
  );
};
