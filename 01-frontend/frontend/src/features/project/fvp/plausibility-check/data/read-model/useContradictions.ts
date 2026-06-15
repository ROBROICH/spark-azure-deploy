import {
  type PlausibilityContradictionListItem,
  usePlausibilityContradictions,
} from '@/features/project/fvp/data/plausibility/usePlausibilityContradictions';
import {
  EXPECTED_MAX_NORMALIZED_RATING,
  EXPECTED_MIN_NORMALIZED_RATING,
  filterContradictions,
  getLowestUsableContradictionRating,
  hasUsableContradictionRatings,
} from '../filtering/contradictionFilters';

export type ContradictionListItem = PlausibilityContradictionListItem;

export type ContradictionDocumentOption = {
  id: string;
  label: string;
};

const useContradictions = (projectId: string) => {
  return usePlausibilityContradictions(projectId);
};

type FilterParams = {
  projectId: string;
  search?: string;
  statusFilter?: string;
  documentFilter?: string;
  ratingThreshold?: number;
};

/**
 * Counts PP contradiction statuses while keeping request-list membership as an
 * independent summary bucket.
 */
const getContradictionsSummary = (contradictions: ContradictionListItem[]) => {
  const summary = {
    total: contradictions.length,
    open: 0,
    onRequestList: 0,
    ignored: 0,
    resolved: 0,
  };

  for (const contradiction of contradictions) {
    if (contradiction.isOnRequestList) {
      summary.onRequestList++;
    }

    switch (contradiction.status) {
      case 'OPEN':
        summary.open++;
        break;
      case 'IGNORED':
        summary.ignored++;
        break;
      case 'RESOLVED':
        summary.resolved++;
        break;
    }
  }

  return summary;
};

const getDocumentOptions = (contradictions: ContradictionListItem[]) => {
  const documentOptionsMap = new Map<string, ContradictionDocumentOption>();
  const occurrences = contradictions.flatMap(
    (contradiction) => contradiction.occurrences,
  );

  for (const occurrence of occurrences) {
    if (documentOptionsMap.has(occurrence.documentId)) {
      continue;
    }

    documentOptionsMap.set(occurrence.documentId, {
      id: occurrence.documentId,
      label: occurrence.documentName ?? occurrence.documentId,
    });
  }

  return [...documentOptionsMap.values()].sort((left, right) =>
    left.label.localeCompare(right.label, 'de'),
  );
};

/**
 * Derives the full PP list view model from shared contradiction data, route
 * filters, request-list linkage, and the rating-threshold control state.
 */
export const useFilteredContradictions = (props: FilterParams) => {
  const { projectId, search, statusFilter, documentFilter, ratingThreshold } =
    props;
  const { contradictions, isLoading } = useContradictions(projectId);
  const summary = getContradictionsSummary(contradictions);
  const hasUsableRatings = hasUsableContradictionRatings(contradictions);
  const lowestRating = getLowestUsableContradictionRating(contradictions);
  const minimumRating =
    lowestRating !== undefined
      ? Math.min(lowestRating, EXPECTED_MIN_NORMALIZED_RATING)
      : EXPECTED_MIN_NORMALIZED_RATING;
  const effectiveRatingThreshold = Math.min(
    Math.max(ratingThreshold ?? minimumRating, minimumRating),
    EXPECTED_MAX_NORMALIZED_RATING,
  );
  const filteredContradictions = filterContradictions(contradictions, {
    search,
    statusFilter,
    documentFilter,
    ratingThreshold: hasUsableRatings ? effectiveRatingThreshold : undefined,
  });

  return {
    contradictions: filteredContradictions,
    summary,
    totalCount: contradictions.length,
    filteredCount: filteredContradictions.length,
    documentOptions: getDocumentOptions(contradictions),
    hasUsableRatings,
    minimumRating,
    isLoading,
  };
};
