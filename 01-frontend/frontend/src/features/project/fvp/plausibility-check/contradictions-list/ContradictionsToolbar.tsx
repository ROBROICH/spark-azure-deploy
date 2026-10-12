import type { PlausibilityNoteStatus } from '@/api-clients/backend';
import { FilterPillMultiSelect } from '@/features/ui/filter-pill-select/FilterPillMultiSelect';
import { getRouteApi } from '@tanstack/react-router';
import { ListFilter } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { DebouncedSearchInput } from '@/features/ui/search-input/DebouncedSearchInput';
import type { ContradictionDocumentOption } from '../data/read-model/useContradictions';
import { ContradictionsRatingFilter } from './ContradictionsRatingFilter';
import { ContradictionsToolbarHeader } from './ContradictionsToolbarHeader';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/pp/');

type ContradictionsMultiFilterName = 'statusFilter' | 'documentFilter';

const splitCommaSeparated = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * Renders PP contradiction search and filter controls backed by route search params.
 *
 * @param props Toolbar counts, document options, disabled state, and rating handlers.
 * @returns The contradiction toolbar with search, rating, status, and document filters.
 */
export const ContradictionsToolbar = (props: {
  disabled?: boolean;
  filteredCount?: number;
  totalCount?: number;
  documentOptions?: ContradictionDocumentOption[];
  hasUsableRatings: boolean;
  minimumRating: number;
  ratingThreshold: number;
  onRatingThresholdChange: (value: number) => void;
}) => {
  const {
    disabled = false,
    filteredCount = 0,
    totalCount = 0,
    documentOptions = [],
    hasUsableRatings,
    minimumRating,
    ratingThreshold,
    onRatingThresholdChange,
  } = props;
  const { t } = useTranslation('PlausibilityCheck');
  const { documentFilter, search = '', statusFilter } = route.useSearch();
  const navigate = route.useNavigate();
  const isDocumentFilterDisabled = disabled || documentOptions.length === 0;

  const statusOptions: {
    value: PlausibilityNoteStatus | 'ON_REQUEST_LIST';
    label: string;
  }[] = [
    { value: 'OPEN', label: t('status.open') },
    { value: 'IGNORED', label: t('status.ignored') },
    { value: 'ON_REQUEST_LIST', label: t('status.onRequestList') },
  ];

  const onSearch = (value: string) => {
    navigate({
      search: (prev) => ({
        ...prev,
        search: value || undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };
  const updateMultiFilter = (
    name: ContradictionsMultiFilterName,
    nextValues: string[],
  ) => {
    navigate({
      search: (prev) => ({
        ...prev,
        [name]: nextValues.length > 0 ? nextValues.join(',') : undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <ContradictionsToolbarHeader totalCount={totalCount} />

      <div className="flex flex-wrap items-center gap-2">
        <DebouncedSearchInput
          value={search}
          onChange={onSearch}
          placeholder={t('ContradictionsToolbar.searchPlaceholder')}
          disabled={disabled}
          inputLabel={t('ContradictionsToolbar.searchPlaceholder')}
          className="max-w-[28.625rem] min-w-[18rem] flex-[0_1_28.625rem]"
          inputClassName="text-[11px] leading-[14px]"
        />
        <div className="ml-auto flex items-center justify-end gap-2">
          <ContradictionsRatingFilter
            disabled={disabled}
            filteredCount={filteredCount}
            totalCount={totalCount}
            hasUsableRatings={hasUsableRatings}
            minimumRating={minimumRating}
            ratingThreshold={ratingThreshold}
            onRatingThresholdChange={onRatingThresholdChange}
          />
          <FilterPillMultiSelect
            icon={<ListFilter aria-hidden="true" className="size-4" />}
            label={t('ContradictionsToolbar.status')}
            value={splitCommaSeparated(statusFilter)}
            onValueChange={(nextValues) => {
              updateMultiFilter('statusFilter', nextValues);
            }}
            options={statusOptions}
            disabled={disabled}
            clearAriaLabel={t('ContradictionsToolbar.clearStatusFilter')}
            align="end"
          />
          <FilterPillMultiSelect
            icon={<ListFilter aria-hidden="true" className="size-4" />}
            label={t('ContradictionsToolbar.documents')}
            value={splitCommaSeparated(documentFilter)}
            onValueChange={(nextValues) => {
              updateMultiFilter('documentFilter', nextValues);
            }}
            options={documentOptions.map((option) => ({
              value: option.id,
              label: (
                <span className="block leading-6 break-all whitespace-normal">
                  {option.label}
                </span>
              ),
            }))}
            disabled={isDocumentFilterDisabled}
            clearAriaLabel={t('ContradictionsToolbar.clearDocumentFilter')}
            align="end"
          />
        </div>
      </div>
    </div>
  );
};
