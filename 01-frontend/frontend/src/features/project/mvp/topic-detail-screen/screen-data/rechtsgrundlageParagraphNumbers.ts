const paragraphNumberCollator = new Intl.Collator('de', {
  numeric: true,
  sensitivity: 'base',
});

export const normalizeParagraphNumber = (paragraphNumber: string | null) => {
  return (paragraphNumber ?? '').replace(/^§\s*/, '').trim();
};

export const createLegalBasisSelectionKey = (
  jurabk: string,
  paragraphNumber: string | null,
) => {
  return `${jurabk.trim().toLocaleLowerCase('de')}::${normalizeParagraphNumber(
    paragraphNumber,
  ).toLocaleLowerCase('de')}`;
};

export const compareParagraphNumbers = (
  leftParagraphNumber: string | null,
  rightParagraphNumber: string | null,
) => {
  return paragraphNumberCollator.compare(
    normalizeParagraphNumber(leftParagraphNumber),
    normalizeParagraphNumber(rightParagraphNumber),
  );
};
