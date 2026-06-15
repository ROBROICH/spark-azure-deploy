import { FilterPillMultiSelect } from '@/features/ui/filter-pill-select/FilterPillMultiSelect';
import {
  FilterPillSelect,
  type FilterPillSelectOption,
} from '@/features/ui/filter-pill-select/FilterPillSelect';
import { DebouncedSearchInput } from '@/features/ui/search-input/DebouncedSearchInput';
import { ListFilter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProjectsTableFeatureContext } from './ProjectsTableFeatureContext';
import type { ZuordnungFilterValue } from './ProjectsTable.utils';

export const ProjectsTableToolbar = () => {
  const {
    routeState: { committedSearch, onCommittedSearchChange, filters },
    anlageOptions,
    artOptions,
    statusOptions,
    favoriteOptions,
    zuordnungOptions,
  } = useProjectsTableFeatureContext();
  const {
    typeFilter,
    anlageFilter,
    statusFilter,
    favoriteFilter,
    zuordnungFilter,
    onTypeFilterChange,
    onAnlageFilterChange,
    onStatusFilterChange,
    onFavoriteFilterChange,
    onZuordnungFilterChange,
  } = filters;
  const { t } = useTranslation('Dashboard');
  const zuordnungSelectOptions: FilterPillSelectOption<
    ZuordnungFilterValue,
    Exclude<ZuordnungFilterValue, 'alle'> | undefined
  >[] = zuordnungOptions.map((option) => ({
    value: option.value,
    queryValue: option.value === 'alle' ? undefined : option.value,
    label: option.label,
  }));
  const zuordnungSelectValue =
    zuordnungFilter === 'alle' ? undefined : zuordnungFilter;

  return (
    <div className="flex w-full flex-wrap justify-between gap-2">
      <DebouncedSearchInput
        inputLabel={t('ProjectsTable.searchPlaceholder')}
        placeholder={t('ProjectsTable.searchPlaceholder')}
        value={committedSearch}
        onChange={onCommittedSearchChange}
        className="max-w-[530px]"
      />
      <div className="flex flex-wrap gap-1">
        <FilterPillMultiSelect
          icon={<ListFilter className="size-4" aria-hidden="true" />}
          label={t('ProjectsTable.filterByAnlage')}
          options={anlageOptions}
          value={anlageFilter}
          onValueChange={onAnlageFilterChange}
        />
        {zuordnungOptions.length > 0 && (
          <FilterPillSelect
            icon={<ListFilter className="size-4" aria-hidden="true" />}
            fallbackLabel={t('ProjectsTable.filterByZuordnung')}
            options={zuordnungSelectOptions}
            value={zuordnungSelectValue}
            onValueChange={(value) => {
              onZuordnungFilterChange(value ?? 'alle');
            }}
          />
        )}
        <FilterPillMultiSelect
          icon={<ListFilter className="size-4" aria-hidden="true" />}
          label={t('ProjectsTable.filterByArt')}
          options={artOptions}
          value={typeFilter}
          onValueChange={onTypeFilterChange}
        />
        <FilterPillMultiSelect
          icon={<ListFilter className="size-4" aria-hidden="true" />}
          label={t('ProjectsTable.filterByStatus')}
          options={statusOptions}
          value={statusFilter}
          onValueChange={onStatusFilterChange}
        />
        <FilterPillMultiSelect
          icon={<ListFilter className="size-4" aria-hidden="true" />}
          label={t('ProjectsTable.filterByFavorite')}
          options={favoriteOptions}
          value={favoriteFilter}
          onValueChange={onFavoriteFilterChange}
        />
      </div>
    </div>
  );
};
