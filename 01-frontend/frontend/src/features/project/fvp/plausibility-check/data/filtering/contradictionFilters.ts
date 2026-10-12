import type { PlausibilityNoteStatus } from '@/api-clients/backend';
import type { StoredContradiction } from '@/features/project/fvp/data/plausibility/contradiction.schema';

type ContradictionListItem = StoredContradiction & { isOnRequestList: boolean };
type RatedContradiction = {
  rating?: number | null;
  confidenceScore?: number | null;
};

export type ContradictionFilter = PlausibilityNoteStatus | 'ON_REQUEST_LIST';
/**
 * Sensitivity scale of the slider (normalized 0..1). The value is absolute, so "show all"
 * must be reachable: the slider always starts at 0.
 */
export const MIN_NORMALIZED_RATING = 0;
export const EXPECTED_MAX_NORMALIZED_RATING = 1;
/**
 * Below this sensitivity a finding is flagged as uncertain. Measured on the adjudicated
 * notes of two reference procedures: >= 60 is true in more than every third case, below that
 * in fewer than every fifth. The slider opens at this value; the legacy rating used the same
 * 0.6 boundary, so older notes keep their behaviour.
 */
export const UNCERTAIN_SENSITIVITY_THRESHOLD = 0.6;
export const DEFAULT_RATING_THRESHOLD = UNCERTAIN_SENSITIVITY_THRESHOLD;

const statusFilterValues = new Set<PlausibilityNoteStatus>([
  'OPEN',
  'IGNORED',
  'RESOLVED',
]);

const parseContradictionFilters = (
  statusFilter?: string,
): Set<ContradictionFilter> => {
  if (!statusFilter) {
    return new Set();
  }

  return new Set(
    statusFilter
      .split(',')
      .map((value) => value.trim())
      .filter(
        (value): value is ContradictionFilter =>
          value === 'ON_REQUEST_LIST' ||
          statusFilterValues.has(value as PlausibilityNoteStatus),
      ),
  );
};

type FilterOptions = {
  search?: string;
  statusFilter?: string;
  documentFilter?: string;
  ratingThreshold?: number;
};

const parseCsvFilter = (value?: string): Set<string> => {
  if (!value) {
    return new Set();
  }

  return new Set(
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );
};

const getContradictionTitle = (
  contradiction: Pick<ContradictionListItem, 'description' | 'title'>,
) => contradiction.title?.trim() || contradiction.description;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/**
 * Sensitivity of a contradiction on a 0..1 scale, used by the slider and the sort order.
 *
 * Prefers `confidenceScore`: the plausibility module's mean of its two evidence scores
 * (0..100). It is an absolute property of the entry and comparable across projects
 * (measured: >= 80 is true in four of five adjudicated cases), so it is always scaled
 * by 100. Falls back to the legacy checker `rating` for notes produced before the
 * confidence layer existed; that value arrives either as 0..100 or already as 0..1.
 */
export const getNormalizedRating = (
  contradiction: RatedContradiction,
): number => {
  if (isFiniteNumber(contradiction.confidenceScore)) {
    return contradiction.confidenceScore / 100;
  }

  const { rating } = contradiction;

  if (!isFiniteNumber(rating)) {
    return Number.NEGATIVE_INFINITY;
  }

  return rating > 1 ? rating / 100 : rating;
};

export const hasUsableContradictionRatings = (
  contradictions: RatedContradiction[],
) =>
  contradictions.some((contradiction) =>
    Number.isFinite(getNormalizedRating(contradiction)),
  );

export const getLowestUsableContradictionRating = (
  contradictions: RatedContradiction[],
): number | undefined => {
  let lowestRating = Number.POSITIVE_INFINITY;

  for (const contradiction of contradictions) {
    const normalizedRating = getNormalizedRating(contradiction);

    if (!Number.isFinite(normalizedRating)) {
      continue;
    }

    lowestRating = Math.min(lowestRating, normalizedRating);
  }

  return Number.isFinite(lowestRating) ? lowestRating : undefined;
};

export const filterContradictions = (
  contradictions: ContradictionListItem[],
  options: FilterOptions,
): ContradictionListItem[] => {
  const { search, statusFilter, documentFilter, ratingThreshold } = options;
  const filters = parseContradictionFilters(statusFilter);
  const documentFilters = parseCsvFilter(documentFilter);
  const statusFilters = Array.from(filters).filter(
    (value): value is PlausibilityNoteStatus =>
      statusFilterValues.has(value as PlausibilityNoteStatus),
  );
  const requiresOnRequestList = filters.has('ON_REQUEST_LIST');

  let filtered = contradictions;

  if (filters.size > 0) {
    filtered = filtered.filter((contradiction) => {
      const matchesStatus = statusFilters.includes(contradiction.status);
      const matchesOnRequestList =
        requiresOnRequestList && contradiction.isOnRequestList;

      return matchesStatus || matchesOnRequestList;
    });
  }

  if (search && search.trim()) {
    const searchLower = search.toLowerCase().trim();
    filtered = filtered.filter((contradiction) => {
      const matchesTitle = getContradictionTitle(contradiction)
        .toLowerCase()
        .includes(searchLower);
      const matchesDescription =
        !matchesTitle &&
        contradiction.description.toLowerCase().includes(searchLower);
      const matchesDocuments = contradiction.occurrences.some((occurrence) =>
        (occurrence.documentName ?? occurrence.documentId)
          .toLowerCase()
          .includes(searchLower),
      );

      return matchesTitle || matchesDescription || matchesDocuments;
    });
  }

  if (documentFilters.size > 0) {
    filtered = filtered.filter((contradiction) =>
      contradiction.occurrences.some((occurrence) =>
        documentFilters.has(occurrence.documentId),
      ),
    );
  }

  if (typeof ratingThreshold === 'number' && Number.isFinite(ratingThreshold)) {
    filtered = filtered.filter(
      (contradiction) => getNormalizedRating(contradiction) >= ratingThreshold,
    );
  }

  return [...filtered].sort((left, right) => {
    const ratingDifference =
      getNormalizedRating(right) - getNormalizedRating(left);

    if (ratingDifference !== 0) {
      return ratingDifference;
    }

    return getContradictionTitle(left).localeCompare(
      getContradictionTitle(right),
      'de',
    );
  });
};
