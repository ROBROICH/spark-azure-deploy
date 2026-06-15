export function isDuplicateInternalProjectNumber(
  existingInternalProjectNumbers: Iterable<string>,
  value: string,
): boolean {
  const normalizedValue = value.trim().toLocaleLowerCase();
  if (!normalizedValue) {
    return false;
  }

  for (const existingValue of existingInternalProjectNumbers) {
    if (existingValue.trim().toLocaleLowerCase() === normalizedValue) {
      return true;
    }
  }

  return false;
}
