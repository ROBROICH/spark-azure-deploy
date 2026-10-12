import { useDescendantNodes } from '@/db/nodes/hooks/useDescendantNodes';
import { useNode } from '@/db/nodes/hooks/useNodes';
import { TopicWritePermissionBadge } from '@/features/access-control/topic-permissions/TopicWritePermissionBadge';
import { Button } from '@/features/ui/button/Button';
import { CompletionIndicator } from '@/features/ui/completion-indicator/CompletionIndicator';
import {
  FilterPillSelect,
  type FilterPillSelectOption,
} from '@/features/ui/filter-pill-select/FilterPillSelect';
import { getRouteApi, Link } from '@tanstack/react-router';
import { ArrowLeftRight, ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isTopicNormChecked } from '../screen-data/useRechtsgrundlageData.helpers';
import type { MvpLaneOrderPreference } from '../mvp.search';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/$topicName/');

type BackButtonBarProps = {
  laneOrderPreference: MvpLaneOrderPreference;
  onLaneOrderChange: (value: MvpLaneOrderPreference) => void;
};

export const BackButtonBar = (props: BackButtonBarProps) => {
  const { laneOrderPreference, onLaneOrderChange } = props;
  const { t } = useTranslation('MvpRedesign');
  const { topicName } = route.useParams();
  const topicRef = { id: topicName, nodeType: 'topic' as const };
  const { data: topic } = useNode(topicRef);
  const { data: topicNorms } = useDescendantNodes('topic_norm', topicRef);
  const bearbeiteteNormCount = topicNorms.filter((topicNorm) =>
    isTopicNormChecked(topicNorm),
  ).length;
  const totalNormCount = topicNorms.length;
  const topicLabel = topic?.name ?? topicName;
  const laneOrderOptions: FilterPillSelectOption<MvpLaneOrderPreference>[] = [
    {
      value: 'documentsFirst',
      label: t('BackButtonBar.documentsFirst'),
    },
    {
      value: 'rechtsgrundlageFirst',
      label: t('BackButtonBar.rechtsgrundlageFirst'),
    },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-primary bg-neutral-white px-2 py-2">
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          iconOnly
          aria-label={t('BackButtonBar.backAriaLabel')}
          asChild
        >
          <Link
            to="/verfahren/$verfahrenId/mvp"
            from="/verfahren/$verfahrenId/mvp/$topicName/"
            search={(prev) => ({
              search: prev.search,
              topicAssigneeIds: prev.topicAssigneeIds,
              topicSort: prev.topicSort,
              topicStatus: prev.topicStatus,
            })}
            resetScroll={false}
          >
            <ChevronLeft aria-hidden="true" />
          </Link>
        </Button>
        <h2 className="text-base font-medium tracking-[-0.01em] text-brand-950">
          {topicLabel}
        </h2>
      </div>

      <div className="flex items-center gap-2">
        {topic ? (
          <TopicWritePermissionBadge
            assigneeIds={topic.mvpAssignees}
            variant="large"
          />
        ) : null}
        <CompletionIndicator
          completed={bearbeiteteNormCount}
          total={totalNormCount}
          className="whitespace-nowrap"
        >
          {t('BackButtonBar.progress', {
            done: bearbeiteteNormCount,
            total: totalNormCount,
          })}
        </CompletionIndicator>
        {/* Hidden below `md`: swimlanes stack vertically there, so lane order has no effect. */}
        <div className="hidden md:inline-flex">
          <FilterPillSelect
            icon={<ArrowLeftRight className="size-4" aria-hidden="true" />}
            fallbackLabel={t('BackButtonBar.toggleLaneOrderFallback')}
            options={laneOrderOptions}
            value={laneOrderPreference}
            clearable={false}
            onValueChange={(value) => {
              if (!value) {
                return;
              }

              onLaneOrderChange(value);
            }}
          />
        </div>
      </div>
    </div>
  );
};
