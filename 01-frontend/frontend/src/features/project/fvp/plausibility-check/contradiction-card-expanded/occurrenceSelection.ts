export const normalizeOccurrenceIndex = (
  occurrenceIndex: number,
  total: number,
) => {
  if (total <= 1) {
    return 0;
  }

  if (occurrenceIndex < 0) {
    return 0;
  }

  if (occurrenceIndex >= total) {
    return total - 1;
  }

  return occurrenceIndex;
};

export const getSelectedOccurrenceIndices = (
  leftOccurrenceIndex: number,
  rightOccurrenceIndex: number,
  total: number,
) => {
  const left = normalizeOccurrenceIndex(leftOccurrenceIndex, total);
  const right = normalizeOccurrenceIndex(rightOccurrenceIndex, total);

  return { left, right };
};
