/**
 * How a finding's stored confidence is read in the topic detail screen.
 *
 * The boundary is not tuned: it is where the search prompt's relevance ranges
 * stop stating that the passage carries an assessment of the legal element. One
 * boundary and no finer grading, because the signal ranks findings rather than
 * stating a calibrated probability.
 */
const FUNDSTELLEN_CARRIES_ASSESSMENT_MINIMUM = 0.6;

export type FundstellenReliabilityLevel = 'carries' | 'supplementary';

/**
 * Maps a stored confidence value to its level. Returns undefined when the
 * finding carries no value, which is a third state rather than a low one: the
 * search stored no assessment for that passage at all.
 */
export const getFundstellenReliabilityLevel = (
  confidence: number | null | undefined,
): FundstellenReliabilityLevel | undefined => {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
    return undefined;
  }

  return confidence >= FUNDSTELLEN_CARRIES_ASSESSMENT_MINIMUM
    ? 'carries'
    : 'supplementary';
};

/**
 * A finding carries the assessment only on a stored value at or above the
 * boundary. An absent value does not, because nothing is known about it.
 */
export const doesFundstelleCarryAssessment = (
  confidence: number | null | undefined,
): boolean => getFundstellenReliabilityLevel(confidence) === 'carries';

/** How many findings of a list carry the assessment, for the card header. */
export const countCarryingFundstellen = (
  entries: ReadonlyArray<{ confidence?: number | null }>,
): number =>
  entries.filter((entry) => doesFundstelleCarryAssessment(entry.confidence))
    .length;
