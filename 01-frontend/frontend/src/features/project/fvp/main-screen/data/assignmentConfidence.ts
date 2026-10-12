export const FVP_ASSIGNMENT_CONFIDENCE_THRESHOLD = 0.8;

export const isUncertainAssignmentConfidence = (
  confidence: number | null | undefined,
): boolean =>
  typeof confidence === 'number' &&
  Number.isFinite(confidence) &&
  confidence < FVP_ASSIGNMENT_CONFIDENCE_THRESHOLD;
