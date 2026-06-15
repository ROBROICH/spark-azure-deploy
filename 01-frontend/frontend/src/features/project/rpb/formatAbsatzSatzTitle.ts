type TranslateFunction = (
  key: string,
  options?: Record<string, unknown>,
) => string;

type FormatAbsatzSatzTitleOptions = {
  hasMultipleAbsaetze?: boolean;
  hasMultipleSaetze?: boolean;
  markerLabel?: string | null;
};

type AbsatzSatzNumbers = {
  absatzNr: string | null | undefined;
  satzNr: string | null | undefined;
};

/**
 * Formats the shared Absatz/Satz number suffix used by Satz rows and legal
 * reference labels.
 */
export const formatAbsatzSatzTitle = (
  t: TranslateFunction,
  numbers: AbsatzSatzNumbers,
  options?: FormatAbsatzSatzTitleOptions,
): string | null => {
  const absatzNr = numbers.absatzNr?.trim();
  const satzNr = numbers.satzNr?.trim();

  if (!absatzNr) {
    return null;
  }

  const hasMultipleAbsaetze = options?.hasMultipleAbsaetze ?? true;
  const hasMultipleSaetze = options?.hasMultipleSaetze ?? true;
  const markerLabel = options?.markerLabel ?? null;

  if (!markerLabel && !hasMultipleAbsaetze && !hasMultipleSaetze) {
    return null;
  }

  if (markerLabel) {
    return t(
      hasMultipleSaetze
        ? 'aiAssistance.satzTitleWithMarker'
        : 'aiAssistance.satzTitleWithoutSatzWithMarker',
      {
        absatz: absatzNr,
        marker: markerLabel,
        satz: satzNr,
      },
    );
  }

  return t(
    hasMultipleSaetze
      ? 'aiAssistance.satzTitle'
      : 'aiAssistance.satzTitleWithoutSatz',
    {
      absatz: absatzNr,
      satz: satzNr,
    },
  );
};
