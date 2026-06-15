const COMBINING_MARKS_REGEX = /[\u0300-\u036f]/g;
const UMLAUT_EQUIVALENTS_REGEX = /(ae|oe|ue)/g;

const toSearchBase = (value: string) =>
  value
    .toLocaleLowerCase('de-DE')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    .replace(COMBINING_MARKS_REGEX, '');

const toGermanSearchVariant = (value: string) =>
  value
    .toLocaleLowerCase('de-DE')
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    .replace(COMBINING_MARKS_REGEX, '');

const toAsciiSearchVariant = (value: string) =>
  toGermanSearchVariant(value).replace(
    UMLAUT_EQUIVALENTS_REGEX,
    (match) => match[0] ?? match,
  );

type SearchVariants = {
  base: string;
  german: string;
  ascii: string;
};

const toSearchVariants = (value: string): SearchVariants => ({
  base: toSearchBase(value),
  german: toGermanSearchVariant(value),
  ascii: toAsciiSearchVariant(value),
});

export const createSearchMatcher = (query: string) => {
  const normalizedQuery = query.trim();

  if (!normalizedQuery) {
    return (_value: string | null | undefined) => true;
  }

  const queryVariants = toSearchVariants(normalizedQuery);

  return (value: string | null | undefined) => {
    if (!value) {
      return false;
    }

    const valueVariants = toSearchVariants(value);

    return (
      valueVariants.base.includes(queryVariants.base) ||
      valueVariants.german.includes(queryVariants.german) ||
      valueVariants.ascii.includes(queryVariants.ascii)
    );
  };
};
