import type { AnlageFilterValue } from './ProjectsTable.constants';

export const deriveOptions = (values: (string | undefined)[]) =>
  [...new Set(values)]
    .filter((value): value is string => Boolean(value))
    .sort()
    .map((value) => ({ label: value, value }));

export type FavoriteFilterValue = 'favorited' | 'not-favorited';
export type ZuordnungFilterValue = 'meine' | 'alle';

export type TableFilters = {
  anlageFilter: AnlageFilterValue[];
  typeFilter: string[];
  statusFilter: string[];
  favoriteFilter: FavoriteFilterValue[];
  zuordnungFilter: ZuordnungFilterValue;
  onAnlageFilterChange: (value: AnlageFilterValue[]) => void;
  onTypeFilterChange: (value: string[]) => void;
  onStatusFilterChange: (value: string[]) => void;
  onFavoriteFilterChange: (value: FavoriteFilterValue[]) => void;
  onZuordnungFilterChange: (value: ZuordnungFilterValue) => void;
};
