const PROCEDURAL_NORM_TYPE_VALUES = new Set([
  'verfahren',
  'verfahrens-rechtlich',
]);

const MATERIAL_NORM_TYPE_VALUES = new Set(['pruefung', 'materiell-rechtlich']);

export type NormTypeBadgeKey = 'material' | 'procedural';
export type NormTypeBadgeDescriptor =
  | { kind: 'key'; value: NormTypeBadgeKey }
  | { kind: 'label'; value: string };

export const capitalizeFirstWord = (label: string) => {
  const trimmedLabel = label.trim();

  if (!trimmedLabel) {
    return null;
  }

  return (trimmedLabel.at(0)?.toUpperCase() ?? '') + trimmedLabel.slice(1);
};

const getNormTypeBadgeKey = (
  normType: string | null | undefined,
): NormTypeBadgeKey | null => {
  const normalizedNormType = normType?.trim().toLocaleLowerCase('de') ?? '';

  if (PROCEDURAL_NORM_TYPE_VALUES.has(normalizedNormType)) {
    return 'procedural';
  }

  if (MATERIAL_NORM_TYPE_VALUES.has(normalizedNormType)) {
    return 'material';
  }

  return null;
};

export const getNormTypeBadgeDescriptor = (
  normType: string | null | undefined,
): NormTypeBadgeDescriptor | null => {
  const key = getNormTypeBadgeKey(normType);

  if (key) {
    return { kind: 'key', value: key };
  }

  const label = capitalizeFirstWord(normType ?? '');
  return label ? { kind: 'label', value: label } : null;
};
