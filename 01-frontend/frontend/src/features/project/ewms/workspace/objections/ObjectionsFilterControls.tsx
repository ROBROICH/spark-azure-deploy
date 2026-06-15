import {
  FilterPillSelect,
  type FilterPillSelectOption,
} from '@/features/ui/filter-pill-select/FilterPillSelect';
import type { TFunction } from 'i18next';
import { ArrowDownUp, ListFilter } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  EwmsObjectionListItem,
  EwmsObjectionSort,
  ObjectionsFilter,
} from '../../data/ewms.nodes';

type ObjectionsTypeFilterPreset =
  | 'all'
  | 'einwendung'
  | 'stellungnahme'
  | 'naturschutz';

type ObjectionsFilterControlsProps = {
  filter: ObjectionsFilter;
  objections: EwmsObjectionListItem[];
  sort: EwmsObjectionSort;
  onFilterChange: (value: ObjectionsFilter) => void;
  onSortChange: (value: EwmsObjectionSort) => void;
};

const resolveFilterPreset = (
  filter: ObjectionsFilter,
): ObjectionsTypeFilterPreset => {
  if (!filter || filter.length === 0) {
    return 'all';
  }

  if (filter.length === 1) {
    return filter[0] ?? 'all';
  }

  return 'all';
};

const getFilterForPreset = (
  preset: Exclude<ObjectionsTypeFilterPreset, 'all'> | undefined,
): ObjectionsFilter => {
  if (preset) {
    return [preset];
  }

  return undefined;
};

const getObjectionsTypeCounts = (objections: EwmsObjectionListItem[]) => {
  const counts = {
    all: objections.length,
    einwendung: 0,
    naturschutz: 0,
    stellungnahme: 0,
  };

  for (const objection of objections) {
    if (objection.entry.beteiligung_typ) {
      counts[objection.entry.beteiligung_typ] += 1;
    }
  }

  return counts;
};

const getObjectionsTypeFilterOptions = (
  t: TFunction<'Ewms'>,
  counts: ReturnType<typeof getObjectionsTypeCounts>,
): FilterPillSelectOption<
  ObjectionsTypeFilterPreset,
  Exclude<ObjectionsTypeFilterPreset, 'all'> | undefined
>[] => [
  {
    value: 'all',
    queryValue: undefined,
    label: t('objections.typeFilter.options.all', { count: counts.all }),
  },
  {
    value: 'einwendung',
    queryValue: 'einwendung',
    label: t('objections.typeFilter.options.einwendung', {
      count: counts.einwendung,
    }),
  },
  {
    value: 'stellungnahme',
    queryValue: 'stellungnahme',
    label: t('objections.typeFilter.options.stellungnahme', {
      count: counts.stellungnahme,
    }),
  },
  {
    value: 'naturschutz',
    queryValue: 'naturschutz',
    label: t('objections.typeFilter.options.naturschutz', {
      count: counts.naturschutz,
    }),
  },
];

const getObjectionsSortOptions = (
  t: TFunction<'Ewms'>,
): FilterPillSelectOption<EwmsObjectionSort>[] => [
  { value: 'nameAsc', label: t('objections.sort.options.nameAsc') },
  { value: 'nameDesc', label: t('objections.sort.options.nameDesc') },
  {
    value: 'createdAtDesc',
    label: t('objections.sort.options.createdAtDesc'),
  },
  { value: 'createdAtAsc', label: t('objections.sort.options.createdAtAsc') },
];

export const ObjectionsFilterControls = (
  props: ObjectionsFilterControlsProps,
) => {
  const { filter, objections, onFilterChange, onSortChange, sort } = props;
  const { t } = useTranslation('Ewms');
  const resolvedFilter = resolveFilterPreset(filter);
  const typeFilterValue = resolvedFilter === 'all' ? undefined : resolvedFilter;
  const typeFilterOptions = getObjectionsTypeFilterOptions(
    t,
    getObjectionsTypeCounts(objections),
  );
  const sortOptions = getObjectionsSortOptions(t);

  return (
    <div className="flex items-center gap-1">
      <FilterPillSelect
        icon={<ListFilter className="size-4" aria-hidden="true" />}
        fallbackLabel={t('objections.typeFilter.label')}
        options={typeFilterOptions}
        value={typeFilterValue}
        onValueChange={(value) => {
          onFilterChange(getFilterForPreset(value));
        }}
        align="end"
      />
      <FilterPillSelect
        icon={<ArrowDownUp className="size-4" aria-hidden="true" />}
        fallbackLabel={t('objections.sort.label')}
        options={sortOptions}
        value={sort}
        onValueChange={(value) => {
          if (value) {
            onSortChange(value);
          }
        }}
        clearable={false}
        align="end"
      />
    </div>
  );
};
