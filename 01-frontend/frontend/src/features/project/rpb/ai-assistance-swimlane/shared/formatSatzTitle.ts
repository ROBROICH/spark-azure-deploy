import type { NodePayloadByType } from '@/db/nodes/types';
import { formatAbsatzSatzTitle } from '../../formatAbsatzSatzTitle';

type TranslateFunction = (
  key: string,
  options?: Record<string, unknown>,
) => string;

type FormatSatzTitleOptions = {
  hasMultipleAbsaetze?: boolean;
  hasMultipleSaetze?: boolean;
};

const numberMarkerPattern = /^\d+(\.\d+)?$/;
const singleLetterMarkerPattern = /^[A-Za-z]$/;
const doubleLetterMarkerPattern = /^[A-Za-z]{2}$/;

const formatMarkerLabel = (
  t: TranslateFunction,
  marker: string,
): string | null => {
  const trimmedMarker = marker.trim();
  if (!trimmedMarker) {
    return null;
  }

  if (numberMarkerPattern.test(trimmedMarker)) {
    return t('aiAssistance.satzMarkerNumber', {
      marker: trimmedMarker,
    });
  }

  if (singleLetterMarkerPattern.test(trimmedMarker)) {
    return t('aiAssistance.satzMarkerLetter', {
      marker: trimmedMarker,
    });
  }

  if (doubleLetterMarkerPattern.test(trimmedMarker)) {
    return t('aiAssistance.satzMarkerDoubleLetter', {
      marker: trimmedMarker,
    });
  }

  return null;
};

const getSatzMarkerLabel = (
  t: TranslateFunction,
  satz: NodePayloadByType<'satz'> | null,
): string | null => {
  if (!satz) {
    return null;
  }

  const markerLabel = satz.markers
    .map((marker) => formatMarkerLabel(t, marker))
    .filter((marker): marker is string => Boolean(marker))
    .join(' ');

  return markerLabel || null;
};

/**
 * Builds the visible legal reference for a Satz row from Absatz/Satz numbers and
 * optional marker fragments, omitting `Satz 1` when the Absatz has no siblings.
 */
export const formatSatzTitle = (
  t: TranslateFunction,
  absatz: NodePayloadByType<'absatz'> | null,
  satz: NodePayloadByType<'satz'> | null,
  options?: FormatSatzTitleOptions,
): string | null => {
  if (!absatz || !satz) {
    return null;
  }

  return formatAbsatzSatzTitle(
    t,
    {
      absatzNr: absatz.absatzNr,
      satzNr: satz.satzNr,
    },
    {
      ...options,
      markerLabel: getSatzMarkerLabel(t, satz),
    },
  );
};
