import { FilterPillMultiSelect } from '@/features/ui/filter-pill-select/FilterPillMultiSelect';
import {
  FilterPillSelect,
  type FilterPillSelectOption,
} from '@/features/ui/filter-pill-select/FilterPillSelect';
import { DebouncedSearchInput } from '@/features/ui/search-input/DebouncedSearchInput';
import { cn } from '@/features/ui/style/cn';
import { getRouteApi } from '@tanstack/react-router';
import { ArrowUpDown, ListChecks, ListFilter } from 'lucide-react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { MvpCardStatus } from '../../mvpTypes';
import { useProjectAssignedUsers } from '../screen-data/useProjectAssignedUsers';
import {
  normalizeTopicAssigneeIds,
  TOPIC_UNASSIGNED_FILTER_ID,
} from '../overview.logic';
import { toUserPickerOptions } from './userPickerOptions';

export type TopicOverviewSort = 'titleAsc' | 'titleDesc';

const route = getRouteApi('/verfahren/$verfahrenId/mvp/');

/**
 * Commits only debounced search text and explicit filter changes to route
 * search so overview refinements do not create noisy browser history entries.
 */
export const MvpTopicsFilterBar = () => {
  const { t } = useTranslation('MaterialCompletenessCheck');
  const searchParams = route.useSearch({
    select: (search) => ({
      search: search.search,
      topicAssigneeIds: search.topicAssigneeIds,
      topicSort: search.topicSort,
      topicStatus: search.topicStatus,
    }),
  });
  const searchHintId = useId();
  const navigate = route.useNavigate();
  const { projectUsers } = useProjectAssignedUsers();

  const search = searchParams.search ?? '';
  const topicAssigneeIds = normalizeTopicAssigneeIds(
    searchParams.topicAssigneeIds,
    projectUsers,
  );
  const topicSort = searchParams.topicSort;
  const topicStatus = searchParams.topicStatus;
  const userOptions = [
    {
      value: TOPIC_UNASSIGNED_FILTER_ID,
      label: t('TopicWorkflow.overviewFilters.unassigned'),
    },
    ...toUserPickerOptions(projectUsers).map((option) => ({
      value: option.id,
      label: option.label,
      disabled: option.disabled,
    })),
  ];
  const selectedUserLabelsById = new Map(
    userOptions.map((option) => [option.value, option.label]),
  );
  const hasUnassignedFilter = topicAssigneeIds.includes(
    TOPIC_UNASSIGNED_FILTER_ID,
  );
  const personFilterLabel =
    topicAssigneeIds.length === 1
      ? selectedUserLabelsById.get(topicAssigneeIds[0] ?? '')
      : topicAssigneeIds.length > 1
        ? t(
            hasUnassignedFilter
              ? 'TopicWorkflow.overviewFilters.personSelectedFilterCount'
              : 'TopicWorkflow.overviewFilters.personSelectedCount',
            {
              count: topicAssigneeIds.length,
            },
          )
        : t('TopicWorkflow.overviewFilters.person');

  const statusOptions: FilterPillSelectOption<MvpCardStatus>[] = [
    {
      value: 'open',
      label: t('TopicWorkflow.overviewFilters.status.options.open'),
    },
    {
      value: 'inProgress',
      label: t('TopicWorkflow.overviewFilters.status.options.inProgress'),
    },
    {
      value: 'complete',
      label: t('TopicWorkflow.overviewFilters.status.options.complete'),
    },
  ];

  const sortOptions: FilterPillSelectOption<
    TopicOverviewSort,
    Exclude<TopicOverviewSort, 'titleAsc'> | undefined
  >[] = [
    {
      value: 'titleAsc',
      queryValue: undefined,
      label: t('TopicWorkflow.overviewFilters.sort.options.titleAsc'),
    },
    {
      value: 'titleDesc',
      queryValue: 'titleDesc',
      label: t('TopicWorkflow.overviewFilters.sort.options.titleDesc'),
    },
  ];

  const sortLabel =
    sortOptions.find((option) => option.queryValue === topicSort)?.label ??
    t('TopicWorkflow.overviewFilters.sort.fallback');

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span id={searchHintId} className="sr-only">
        {t('TopicWorkflow.overviewFilters.searchHint')}
      </span>
      <DebouncedSearchInput
        value={search}
        onChange={(value) => {
          navigate({
            search: (prev) => ({
              ...prev,
              search: value || undefined,
            }),
            replace: true,
            resetScroll: false,
          });
        }}
        placeholder={t('TopicWorkflow.overviewFilters.searchPlaceholder')}
        inputLabel={t('TopicWorkflow.overviewFilters.searchPlaceholder')}
        aria-describedby={searchHintId}
        className="max-w-[540px] min-w-[280px]"
      />

      <div className="ml-auto flex items-center gap-4">
        <FilterPillMultiSelect
          icon={<ListFilter className="size-4" aria-hidden="true" />}
          label={t('TopicWorkflow.overviewFilters.person')}
          value={topicAssigneeIds}
          onValueChange={(nextAssigneeIds) => {
            const sortedAssigneeIds = normalizeTopicAssigneeIds(
              nextAssigneeIds,
              projectUsers,
            );
            navigate({
              search: (prev) => ({
                ...prev,
                topicAssigneeIds:
                  sortedAssigneeIds.length > 0 ? sortedAssigneeIds : undefined,
              }),
              replace: true,
              resetScroll: false,
            });
          }}
          options={userOptions}
          emptyLabel={t('TopicWorkflow.overviewFilters.personEmpty')}
          selectedLabel={
            <>
              {topicAssigneeIds.length > 0 ? (
                <span className="sr-only">
                  {t('TopicWorkflow.overviewFilters.person')}:{' '}
                </span>
              ) : null}
              <span className="max-w-36 truncate">{personFilterLabel}</span>
            </>
          }
          showSelectedCount={false}
          triggerClassName={cn(topicAssigneeIds.length > 0 && 'text-slate-900')}
        />
        <FilterPillSelect
          icon={<ListChecks className="size-4" aria-hidden="true" />}
          fallbackLabel={t('TopicWorkflow.overviewFilters.status.label')}
          options={statusOptions}
          value={topicStatus}
          onValueChange={(queryValue) => {
            navigate({
              search: (prev) => ({ ...prev, topicStatus: queryValue }),
              replace: true,
              resetScroll: false,
            });
          }}
        />
        <FilterPillSelect
          icon={<ArrowUpDown className="size-4" aria-hidden="true" />}
          fallbackLabel={sortLabel}
          options={sortOptions}
          value={topicSort}
          onValueChange={(queryValue) => {
            navigate({
              search: (prev) => ({ ...prev, topicSort: queryValue }),
              replace: true,
              resetScroll: false,
            });
          }}
        />
      </div>
    </div>
  );
};
