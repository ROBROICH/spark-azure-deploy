import type {
  AggregatedLawChangeNormRef,
  DetailedLawChangeApiResponse,
  LawChangeNormRef,
  LawChangeRecord,
  PendingLawChangeApiResponse,
} from './lawChanges.types';

const PARAGRAPH_PREFIX_PATTERN = /^§\s*/;

const normalizeParagraphNr = (paragraphNr: string) => {
  return paragraphNr.replace(PARAGRAPH_PREFIX_PATTERN, '').trim();
};

/**
 * Creates a short, deterministic fingerprint for law-change content.
 *
 * This is intentionally not a security-sensitive hash. We only use it to keep
 * otherwise duplicated frontend IDs distinct when the API returns multiple
 * changes for the same law, affected norm, and valid-from date. In other
 * words: the metadata can collide, so we fingerprint the text payload to keep
 * those records separately addressable in the UI.
 */
const createStableContentFingerprint = (parts: string[]) => {
  let hash = 2166136261;

  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash ^= part.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= 124;
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
};

export const createLawChangeId = (
  jurabk: string,
  paragraphNr: string,
  validFrom: string,
  contentFingerprint?: string,
) => {
  const baseId = `${jurabk}__${normalizeParagraphNr(paragraphNr)}__${validFrom}`;

  if (!contentFingerprint) {
    return baseId;
  }

  return `${baseId}__${contentFingerprint}`;
};

export const normalizeLawChangesResponse = (
  response: DetailedLawChangeApiResponse[],
): LawChangeRecord[] => {
  return response.flatMap((lawChange) =>
    lawChange.affected_norms.map((affectedNorm) => {
      const currentText = affectedNorm.current_text;
      const changeText = affectedNorm.change_text;
      const newText = affectedNorm.new_text;
      const transitionalNote = affectedNorm.transitional_note ?? '';
      const contentFingerprint = createStableContentFingerprint([
        currentText,
        changeText,
        newText,
        transitionalNote,
      ]);

      return {
        id: createLawChangeId(
          lawChange.jurabk,
          affectedNorm.paragraph_nr,
          lawChange.valid_from,
          contentFingerprint,
        ),
        jurabk: lawChange.jurabk,
        paragraphNr: normalizeParagraphNr(affectedNorm.paragraph_nr),
        currentText,
        changeText,
        newText,
        transitionalNote,
        validFrom: lawChange.valid_from,
      };
    }),
  );
};

export const isDetailedLawChangesResponse = (
  response: PendingLawChangeApiResponse[],
): response is DetailedLawChangeApiResponse[] => {
  return response.every((lawChange) =>
    lawChange.affected_norms.every((affectedNorm) => {
      return typeof affectedNorm !== 'string';
    }),
  );
};

const matchesLawChangeNorm = (
  lawChange: LawChangeRecord,
  normRef: LawChangeNormRef,
) => {
  if (!normRef.paragraphNr) {
    return false;
  }

  return (
    lawChange.jurabk === normRef.jurabk &&
    normalizeParagraphNr(lawChange.paragraphNr) ===
      normalizeParagraphNr(normRef.paragraphNr)
  );
};

export const getLawChangeNormLabel = (normRef: LawChangeNormRef) => {
  if (!normRef.paragraphNr) {
    return normRef.jurabk;
  }

  return `§ ${normalizeParagraphNr(normRef.paragraphNr)} ${normRef.jurabk}`;
};

export const getLawChangeMatchesForNorm = (
  lawChanges: LawChangeRecord[],
  normRef: LawChangeNormRef,
) => {
  return lawChanges
    .filter((lawChange) => matchesLawChangeNorm(lawChange, normRef))
    .sort((left, right) => left.validFrom.localeCompare(right.validFrom));
};

export const getAggregatedLawChangeMatches = (
  lawChanges: LawChangeRecord[],
  norms: AggregatedLawChangeNormRef[],
) => {
  const matchedLawChanges = new Map<string, LawChangeRecord>();

  for (const norm of norms) {
    for (const lawChange of getLawChangeMatchesForNorm(lawChanges, norm)) {
      matchedLawChanges.set(lawChange.id, lawChange);
    }
  }

  return Array.from(matchedLawChanges.values()).sort((left, right) => {
    const lawCompare = left.jurabk.localeCompare(right.jurabk, 'de', {
      sensitivity: 'base',
    });
    if (lawCompare !== 0) {
      return lawCompare;
    }

    const paragraphCompare = normalizeParagraphNr(
      left.paragraphNr,
    ).localeCompare(normalizeParagraphNr(right.paragraphNr), 'de', {
      numeric: true,
      sensitivity: 'base',
    });

    if (paragraphCompare !== 0) {
      return paragraphCompare;
    }

    return left.validFrom.localeCompare(right.validFrom);
  });
};
