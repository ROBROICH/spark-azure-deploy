import type { ReactNode } from 'react';
import { SelectMenu } from '@/features/ui/select-menu/SelectMenu';
import { SwimlaneHeaderPortal } from '@/features/ui/swimlanes/SwimlaneHeaderPortal';
import { useTopicNodes } from '@/db/nodes/hooks/useTopicNodes';
import { getRouteApi } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { setRpbTopicSearch } from '../../rpb.search';

const route = getRouteApi('/verfahren/$verfahrenId/rpb');
const EMPTY_TOPIC_SELECTION_VALUE = '__rpb_empty_topic_selection__';

type AiTopicHeaderProps = {
  titleKey: string;
  leading?: ReactNode;
  trailing?: ReactNode;
  showTopicSelect?: boolean;
  allowEmptyTopicSelection?: boolean;
};

const AiTopicSelect = (props: { allowEmptyTopicSelection: boolean }) => {
  const { allowEmptyTopicSelection } = props;
  const { t } = useTranslation('Rpb');
  const { topicId } = route.useSearch({
    select: (search) => ({ topicId: search.topicId }),
  });
  const navigate = route.useNavigate();
  const { data: topics } = useTopicNodes();
  const topicItems = topics.map((topic) => ({
    value: topic.id,
    label: topic.name,
  }));
  const items = allowEmptyTopicSelection
    ? [
        {
          value: EMPTY_TOPIC_SELECTION_VALUE,
          label: t('aiAssistance.selectTopic'),
        },
        ...topicItems,
      ]
    : topicItems;

  return (
    <SelectMenu
      variant="badge"
      items={items}
      value={topicId ?? ''}
      onChange={(nextValue) => {
        const nextTopicId =
          nextValue === EMPTY_TOPIC_SELECTION_VALUE ? undefined : nextValue;

        if (nextTopicId === topicId) {
          return;
        }

        void navigate({
          search: (prev) => setRpbTopicSearch(prev, nextTopicId),
          resetScroll: false,
        });
      }}
      placeholder={t('aiAssistance.selectTopic')}
      ariaLabel={t('aiAssistance.selectTopic')}
      align="end"
      className="max-h-80 overflow-y-auto"
      triggerClassName="max-w-56 shrink-0"
    />
  );
};

export const AiTopicHeader = (props: AiTopicHeaderProps) => {
  const {
    titleKey,
    leading,
    trailing,
    showTopicSelect = true,
    allowEmptyTopicSelection = false,
  } = props;
  const { t } = useTranslation('Rpb');

  return (
    <SwimlaneHeaderPortal>
      {leading}
      <span className="flex-1 text-[13px] leading-[18px] font-medium tracking-[-0.13px] text-brand-950 md:min-w-0">
        {t(titleKey)}
      </span>
      <div className="flex shrink-0 items-center gap-2">
        {showTopicSelect ? (
          <AiTopicSelect allowEmptyTopicSelection={allowEmptyTopicSelection} />
        ) : null}
        {trailing}
      </div>
    </SwimlaneHeaderPortal>
  );
};
