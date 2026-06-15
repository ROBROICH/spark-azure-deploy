export const getNormRequestTitle = (
  paragraphNumber: string | undefined,
  jurabk: string | undefined,
  fallback: string,
) =>
  [paragraphNumber ? `§ ${paragraphNumber}` : undefined, jurabk]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(' ') || fallback;
