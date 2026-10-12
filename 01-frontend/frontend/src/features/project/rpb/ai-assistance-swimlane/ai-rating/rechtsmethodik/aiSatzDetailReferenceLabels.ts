import type { NodePayloadByType } from '@/db/nodes/types';
import { uniqBy } from 'es-toolkit';
import { formatAbsatzSatzTitle } from '../../../formatAbsatzSatzTitle';

type TranslateFunction = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export type RechtsmethodikExpliziterVerweisNode = Pick<
  NodePayloadByType<'expliziter_verweis'>,
  'absatzNr' | 'gesetz' | 'id' | 'paragraphNr' | 'satzNr' | 'untergliederung'
> & {
  verordnung?: string | null;
};

export type RechtsmethodikVerweis = {
  id: string;
  label: string;
};

const untergliederungTypes = new Set([
  'Nummer',
  'Buchstabe',
  'Doppelbuchstabe',
]);

const getTitleDedupeKey = (title: string) => {
  return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
};

const getReferenceAbsatzSatzLabel = (
  t: TranslateFunction,
  reference: RechtsmethodikExpliziterVerweisNode,
) => {
  return formatAbsatzSatzTitle(
    t,
    {
      absatzNr: reference.absatzNr,
      satzNr: reference.satzNr,
    },
    {
      hasMultipleSaetze: Boolean(reference.satzNr?.trim()),
    },
  );
};

const getUntergliederungLabels = (untergliederung: unknown[] | null) => {
  if (!untergliederung) {
    return [];
  }

  return untergliederung
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const trimmedTyp =
        'typ' in item && typeof item.typ === 'string' ? item.typ.trim() : null;
      const trimmedWert =
        'wert' in item && typeof item.wert === 'string'
          ? item.wert.trim()
          : null;

      if (
        !trimmedTyp ||
        !trimmedWert ||
        !untergliederungTypes.has(trimmedTyp)
      ) {
        return null;
      }

      return `${trimmedTyp} ${trimmedWert}`;
    })
    .filter((label): label is string => Boolean(label));
};

const getReferenceCitationParts = (
  t: TranslateFunction,
  reference: RechtsmethodikExpliziterVerweisNode,
): string[] => {
  const paragraphLabel = reference.paragraphNr?.trim()
    ? `§ ${reference.paragraphNr.trim()}`
    : null;

  return [
    paragraphLabel,
    getReferenceAbsatzSatzLabel(t, reference),
    ...getUntergliederungLabels(reference.untergliederung),
  ].filter((part): part is string => Boolean(part));
};

const getCompactReferenceLawLabel = (value: string | null | undefined) => {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  return trimmedValue
    .split('\n')[0]
    ?.split('•')[0]
    ?.trim()
    .replace(/\s+/g, ' ');
};

const getReferenceLabel = (
  t: TranslateFunction,
  reference: RechtsmethodikExpliziterVerweisNode,
  citationParts: string[],
): string => {
  const source =
    getCompactReferenceLawLabel(reference.gesetz) ??
    getCompactReferenceLawLabel(reference.verordnung);

  return (
    [...citationParts, source]
      .filter((part): part is string => Boolean(part))
      .join(' ') || t('aiAssistance.referenceFallbackLabel')
  );
};

export const getVerweise = (
  t: TranslateFunction,
  references: RechtsmethodikExpliziterVerweisNode[],
): RechtsmethodikVerweis[] => {
  return uniqBy(
    references.map((reference) => {
      const citationParts = getReferenceCitationParts(t, reference);

      return {
        id: reference.id,
        label: getReferenceLabel(t, reference, citationParts),
      };
    }),
    (reference) => getTitleDedupeKey(reference.label),
  );
};
