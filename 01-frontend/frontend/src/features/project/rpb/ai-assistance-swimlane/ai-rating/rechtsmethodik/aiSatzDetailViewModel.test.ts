import { describe, expect, it } from 'vitest';
import {
  getBestimmteRechtsbegriffe,
  getUnbestimmteRechtsbegriffe,
  getVerweise,
  type RechtsmethodikBestimmterRechtsbegriffNode,
  type RechtsmethodikExpliziterVerweisNode,
  type RechtsmethodikLegaldefinition,
  type RechtsmethodikUnbestimmterRechtsbegriffNode,
} from './aiSatzDetailViewModel';

const t = (key: string, options?: Record<string, unknown>) => {
  if (key === 'aiAssistance.referenceFallbackLabel') {
    return 'Verweis';
  }

  if (key === 'aiAssistance.satzTitle') {
    return `Absatz ${String(options?.absatz ?? '')} Satz ${String(options?.satz ?? '')}`;
  }

  if (key === 'aiAssistance.satzTitleWithoutSatz') {
    return `Absatz ${String(options?.absatz ?? '')}`;
  }

  return key;
};

const createBestimmterRechtsbegriff = (
  id: string,
  begriff: string,
): RechtsmethodikBestimmterRechtsbegriffNode => {
  return {
    id,
    begriff,
  } satisfies RechtsmethodikBestimmterRechtsbegriffNode;
};

const createLegaldefinition = (
  id: string,
  bestimmterRechtsbegriffId: string,
): RechtsmethodikLegaldefinition => {
  return {
    id,
    bestimmter_rechtsbegriff_id: bestimmterRechtsbegriffId,
    definition: `Definition ${id}`,
  } satisfies RechtsmethodikLegaldefinition;
};

const createUnbestimmterRechtsbegriff = (
  id: string,
  begriff: string,
  auslegung = `Gesamtauslegung ${id}`,
): RechtsmethodikUnbestimmterRechtsbegriffNode => {
  return {
    auslegung,
    id,
    begriff,
  } satisfies RechtsmethodikUnbestimmterRechtsbegriffNode;
};

const createAuslegungsvorschlag = (
  id: string,
  unbestimmterRechtsbegriffId: string,
): {
  id: string;
  methode: string;
  text: string;
  unbestimmter_rechtsbegriff_id: string;
} => {
  return {
    id,
    methode: 'Wortlaut',
    text: `Auslegung ${id}`,
    unbestimmter_rechtsbegriff_id: unbestimmterRechtsbegriffId,
  };
};

const createVerweis = (
  id: string,
  gesetz: string,
  paragraphNr: string,
  absatzNr?: string,
  satzNr?: string,
  untergliederung: unknown[] | null = null,
): RechtsmethodikExpliziterVerweisNode => {
  return {
    absatz_nr: absatzNr ?? null,
    id,
    gesetz,
    paragraph_nr: paragraphNr,
    satz_nr: satzNr ?? null,
    untergliederung,
  } satisfies RechtsmethodikExpliziterVerweisNode;
};

describe('aiSatzDetailViewModel', () => {
  it('deduplicates legal definitions by normalized term title', () => {
    const entries = getBestimmteRechtsbegriffe(
      [
        createBestimmterRechtsbegriff('term-1', 'Besonders geschuetzte Arten'),
        createBestimmterRechtsbegriff(
          'term-2',
          ' besonders   geschuetzte arten ',
        ),
        createBestimmterRechtsbegriff('term-3', 'Andere Begriffe'),
      ],
      [
        createLegaldefinition('definition-1', 'term-1'),
        createLegaldefinition('definition-2', 'term-2'),
        createLegaldefinition('definition-3', 'term-3'),
      ],
    );

    expect(entries.map((entry) => entry.term.id)).toEqual(['term-1', 'term-3']);
    expect(entries.map((entry) => entry.definition?.id)).toEqual([
      'definition-1',
      'definition-3',
    ]);
  });

  it('deduplicates unbestimmte rechtsbegriffe by normalized term title', () => {
    const entries = getUnbestimmteRechtsbegriffe(
      [
        createUnbestimmterRechtsbegriff('term-1', 'Beteiligte Kreise'),
        createUnbestimmterRechtsbegriff('term-2', ' beteiligte   kreise '),
        createUnbestimmterRechtsbegriff('term-3', 'Oeffentliche Belange'),
      ],
      [
        createAuslegungsvorschlag('auslegung-1', 'term-1'),
        createAuslegungsvorschlag('auslegung-2', 'term-2'),
        createAuslegungsvorschlag('auslegung-3', 'term-3'),
      ],
    );

    expect(entries.map((entry) => entry.term.id)).toEqual(['term-1', 'term-3']);
    expect(entries.map((entry) => entry.methoden[0]?.id)).toEqual([
      'auslegung-1',
      'auslegung-3',
    ]);
  });

  it('uses the unbestimmter rechtsbegriff auslegung field as Gesamtauslegung', () => {
    const entries = getUnbestimmteRechtsbegriffe(
      [
        createUnbestimmterRechtsbegriff(
          'term-1',
          'Beteiligte Kreise',
          'Gesamtauslegung aus dem Begriffsknoten',
        ),
      ],
      [
        createAuslegungsvorschlag('auslegung-1', 'term-1'),
        createAuslegungsvorschlag('auslegung-2', 'term-1'),
      ],
    );

    expect(entries[0]?.gesamtauslegung).toBe(
      'Gesamtauslegung aus dem Begriffsknoten',
    );
  });

  it('deduplicates references by normalized rendered title', () => {
    const references = getVerweise(t, [
      createVerweis('verweis-1', 'EnWG', '43', '1', '2'),
      createVerweis('verweis-2', ' enwg ', '43', '1', '2'),
      createVerweis('verweis-3', 'BNatSchG', '7'),
    ]);

    expect(references.map((reference) => reference.id)).toEqual([
      'verweis-1',
      'verweis-3',
    ]);
    expect(references.map((reference) => reference.label)).toEqual([
      '§ 43 Absatz 1 Satz 2 EnWG',
      '§ 7 BNatSchG',
    ]);
  });

  it('formats references from paragraph, absatz, satz, untergliederung, and source', () => {
    const references = getVerweise(t, [
      createVerweis('verweis-1', 'Bundesnaturschutzgesetz', '7', '2', '1', [
        { typ: 'Nummer', wert: '5' },
        { typ: 'Buchstabe', wert: 'b' },
        { typ: 'Randnummer', wert: '9' },
      ]),
    ]);

    expect(references.map((reference) => reference.label)).toEqual([
      '§ 7 Absatz 2 Satz 1 Nummer 5 Buchstabe b Bundesnaturschutzgesetz',
    ]);
  });

  it('uses verordnung as the reference source when gesetz is absent', () => {
    const references = getVerweise(t, [
      {
        ...createVerweis('verweis-1', '', '12', undefined, undefined),
        gesetz: null,
        verordnung: 'Bundesartenschutzverordnung',
      },
    ]);

    expect(references.map((reference) => reference.label)).toEqual([
      '§ 12 Bundesartenschutzverordnung',
    ]);
  });
});
