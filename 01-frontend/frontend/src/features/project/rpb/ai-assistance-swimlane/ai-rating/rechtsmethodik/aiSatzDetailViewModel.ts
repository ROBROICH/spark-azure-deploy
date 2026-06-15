import type { NodePayloadByType } from '@/db/nodes/types';
import { uniqBy } from 'es-toolkit';
import { getNormLabel } from '../../rechtsgrundlage/aiNormLabel';
import {
  getNormTypeBadgeDescriptor,
  type NormTypeBadgeDescriptor,
} from './normTypeBadgeLabels';

export { getVerweise } from './aiSatzDetailReferenceLabels';
export type {
  RechtsmethodikExpliziterVerweisNode,
  RechtsmethodikVerweis,
} from './aiSatzDetailReferenceLabels';

type TranslateFunction = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export type RechtsmethodikBestimmterRechtsbegriffNode = Pick<
  NodePayloadByType<'bestimmter_rechtsbegriff'>,
  'begriff' | 'id'
>;

export type RechtsmethodikLegaldefinition = Pick<
  NodePayloadByType<'legaldefinition'>,
  'bestimmter_rechtsbegriff_id' | 'definition' | 'id'
> &
  Partial<
    Pick<
      NodePayloadByType<'legaldefinition'>,
      'source_jurabk' | 'source_paragraph_nr'
    >
  >;

export type RechtsmethodikUnbestimmterRechtsbegriffNode = Pick<
  NodePayloadByType<'unbestimmter_rechtsbegriff'>,
  'auslegung' | 'begriff' | 'id'
>;

type RechtsmethodikAuslegungsvorschlagNode = Pick<
  NodePayloadByType<'auslegungsvorschlag'>,
  'id' | 'methode' | 'text' | 'unbestimmter_rechtsbegriff_id'
>;

export type RechtsmethodikBestimmterBegriff = {
  definition: RechtsmethodikLegaldefinition | null;
  term: RechtsmethodikBestimmterRechtsbegriffNode;
};

export type RechtsmethodikAuslegungsmethode = {
  id: string;
  label: string;
  text: string;
};

export type RechtsmethodikUnbestimmterBegriff = {
  gesamtauslegung: string | null;
  methoden: RechtsmethodikAuslegungsmethode[];
  term: RechtsmethodikUnbestimmterRechtsbegriffNode;
};

const appendUnique = (
  items: string[],
  value: string | null | undefined,
): string[] => {
  const trimmedValue = value?.trim();
  if (!trimmedValue || items.includes(trimmedValue)) {
    return items;
  }

  return [...items, trimmedValue];
};

const appendUniqueNormTypeBadge = (
  items: NormTypeBadgeDescriptor[],
  value: string | null | undefined,
): NormTypeBadgeDescriptor[] => {
  const badge = getNormTypeBadgeDescriptor(value);

  if (
    !badge ||
    items.some((item) => item.kind === badge.kind && item.value === badge.value)
  ) {
    return items;
  }

  return [...items, badge];
};

const getTitleDedupeKey = (title: string) => {
  return title.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
};

const dedupeByTitle = <T>(items: T[], getTitle: (item: T) => string): T[] => {
  return uniqBy(items, (item) => getTitleDedupeKey(getTitle(item)));
};

export const getRechtsmethodikHeaderTitle = (
  gesetz: NodePayloadByType<'gesetz'> | null,
  norm: NodePayloadByType<'norm'> | null,
): string => {
  const jurabk = gesetz?.jurabk.trim();
  const paragraphNumber = norm?.paragraph_nr.trim();

  if (jurabk && paragraphNumber) {
    return `${jurabk} § ${paragraphNumber}`;
  }

  if (jurabk) {
    return jurabk;
  }

  return getNormLabel(norm);
};

export const getSentenceTypeBadges = (
  satz: NodePayloadByType<'satz'> | null,
): NormTypeBadgeDescriptor[] => {
  if (!satz) {
    return [];
  }

  let badges: NormTypeBadgeDescriptor[] = [];
  badges = appendUniqueNormTypeBadge(badges, satz.norm_typ_lvl_1);
  badges = appendUniqueNormTypeBadge(badges, satz.norm_typ_lvl_2);
  return badges;
};

export const getTatbestandsmerkmale = (
  atomareTbms: NodePayloadByType<'atomares_tbm'>[],
): string[] => {
  return atomareTbms
    .map((tbm, index) => {
      const prueffrage = tbm.prueffrage?.trim() || null;
      const pruefgegenstand = tbm.pruefgegenstand?.trim() || null;
      const fallbackText = tbm.text.trim();
      const shorterAlternative =
        [fallbackText, pruefgegenstand].find(
          (candidate) =>
            candidate &&
            candidate.length > 0 &&
            candidate.length < (prueffrage?.length ?? Number.MAX_SAFE_INTEGER),
        ) ?? null;
      const text =
        prueffrage && prueffrage.length <= 180
          ? prueffrage
          : shorterAlternative || prueffrage || fallbackText;

      return `${index + 1}: ${text}`;
    })
    .filter((text) => text.length > 0);
};

export const getBestimmteRechtsbegriffe = (
  terms: RechtsmethodikBestimmterRechtsbegriffNode[],
  definitions: RechtsmethodikLegaldefinition[],
): RechtsmethodikBestimmterBegriff[] => {
  const definitionsByTermId = new Map(
    definitions.map((definition) => [
      definition.bestimmter_rechtsbegriff_id,
      definition,
    ]),
  );

  return dedupeByTitle(
    terms.map((term) => ({
      definition: definitionsByTermId.get(term.id) ?? null,
      term,
    })),
    (entry) => entry.term.begriff,
  );
};

const formatMethodLabel = (label: string) => {
  if (label.length === 0) {
    return label;
  }

  return (label.at(0)?.toUpperCase() ?? '') + label.slice(1);
};

export const getUnbestimmteRechtsbegriffe = (
  terms: RechtsmethodikUnbestimmterRechtsbegriffNode[],
  interpretations: RechtsmethodikAuslegungsvorschlagNode[],
): RechtsmethodikUnbestimmterBegriff[] => {
  const methodsByTermId = new Map<string, RechtsmethodikAuslegungsmethode[]>();

  for (const interpretation of interpretations) {
    const existingMethods =
      methodsByTermId.get(interpretation.unbestimmter_rechtsbegriff_id) ?? [];

    methodsByTermId.set(interpretation.unbestimmter_rechtsbegriff_id, [
      ...existingMethods,
      {
        id: interpretation.id,
        label: formatMethodLabel(interpretation.methode),
        text: interpretation.text,
      },
    ]);
  }

  return dedupeByTitle(
    terms.map((term) => {
      const methoden = methodsByTermId.get(term.id) ?? [];

      return {
        gesamtauslegung: term.auslegung.trim() || null,
        methoden,
        term,
      };
    }),
    (entry) => entry.term.begriff,
  );
};

export const getRechtsfolgeBadges = (
  adressaten: NodePayloadByType<'adressat'>[],
  sollensanordnungen: NodePayloadByType<'sollensanordnungen'>[],
): string[] => {
  let badges: string[] = [];

  for (const sollensanordnung of sollensanordnungen) {
    badges = appendUnique(badges, sollensanordnung.kategorie);
  }

  for (const adressat of adressaten) {
    badges = appendUnique(badges, adressat.entscheidung);
  }

  return badges;
};

export const getLegalDefinitionSourceLabel = (
  t: TranslateFunction,
  definition: RechtsmethodikLegaldefinition,
): string | null => {
  const sourceParts: string[] = [];

  if (definition.source_jurabk?.trim()) {
    sourceParts.push(definition.source_jurabk.trim());
  }

  if (definition.source_paragraph_nr?.trim()) {
    sourceParts.push(`§ ${definition.source_paragraph_nr.trim()}`);
  }

  if (sourceParts.length === 0) {
    return null;
  }

  return t('aiAssistance.definitionSourceLabel', {
    source: sourceParts.join(' '),
  });
};
