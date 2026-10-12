import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType, NodeTypeLiteral } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import {
  getBestimmteRechtsbegriffe,
  getRechtsfolgeBadges,
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
    bestimmterRechtsbegriffId: bestimmterRechtsbegriffId,
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
  unbestimmterRechtsbegriffId: string;
} => {
  return {
    id,
    methode: 'Wortlaut',
    text: `Auslegung ${id}`,
    unbestimmterRechtsbegriffId: unbestimmterRechtsbegriffId,
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
    absatzNr: absatzNr ?? null,
    id,
    gesetz,
    paragraphNr: paragraphNr,
    satzNr: satzNr ?? null,
    untergliederung,
  } satisfies RechtsmethodikExpliziterVerweisNode;
};

const createRechtsfolgeChildBase = (nodeType: NodeTypeLiteral, id: string) => ({
  compositeKey: toCompositeKey({ id, nodeType: nodeType }),
  createdAt: '2026-01-01T00:00:00Z',
  frontendParentIds: [],
  id,
  isDeleted: false,
  isOutdated: false,
  projectId: 'project-1',
  projectVersion: 1,
  reasoning: null,
  rechtsfolgeId: 'rechtsfolge-1',
  updateType: null,
  updatedAt: '2026-01-01T00:00:00Z',
});

const createSollensanordnung = (id: string, kategorie: string) => {
  return {
    ...createRechtsfolgeChildBase('sollensanordnungen', id),
    kategorie,
    nodeType: 'sollensanordnungen',
  } satisfies NodePayloadByType<'sollensanordnungen'>;
};

const createErmessensspielraum = (id: string, entscheidung: string) => {
  return {
    ...createRechtsfolgeChildBase('ermessensspielraum', id),
    entscheidung,
    nodeType: 'ermessensspielraum',
  } satisfies NodePayloadByType<'ermessensspielraum'>;
};

const createErmessensart = (id: string, art: string) => {
  return {
    ...createRechtsfolgeChildBase('ermessensart', id),
    art,
    nodeType: 'ermessensart',
  } satisfies NodePayloadByType<'ermessensart'>;
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

  it('shows the discretion scope and the discretion type after the deontic category', () => {
    const badges = getRechtsfolgeBadges(
      [createSollensanordnung('soll-1', 'verbot')],
      [createErmessensspielraum('spielraum-1', 'ermessensentscheidung')],
      [createErmessensart('art-1', 'auswahlermessen')],
    );

    expect(badges).toEqual([
      'Verbot',
      'Ermessensentscheidung',
      'Auswahlermessen',
    ]);
  });

  it('shows the discretion scope alone when no discretion type is stored', () => {
    const badges = getRechtsfolgeBadges(
      [createSollensanordnung('soll-1', 'gebot')],
      [createErmessensspielraum('spielraum-1', 'gebundene entscheidung')],
      [],
    );

    expect(badges).toEqual(['Gebot', 'Gebundene entscheidung']);
  });

  it('shows the deontic categories alone when no discretion is stored', () => {
    const badges = getRechtsfolgeBadges(
      [createSollensanordnung('soll-1', 'erlaubnis')],
      [],
      [],
    );

    expect(badges).toEqual(['Erlaubnis']);
  });

  it('shows a repeated discretion value once', () => {
    const badges = getRechtsfolgeBadges(
      [],
      [
        createErmessensspielraum('spielraum-1', 'ermessensentscheidung'),
        createErmessensspielraum('spielraum-2', ' ermessensentscheidung '),
      ],
      [
        createErmessensart('art-1', 'auswahlermessen'),
        createErmessensart('art-2', 'auswahlermessen'),
      ],
    );

    expect(badges).toEqual(['Ermessensentscheidung', 'Auswahlermessen']);
  });

  it('shows a value repeated across two badge sources once', () => {
    const badges = getRechtsfolgeBadges(
      [createSollensanordnung('soll-1', 'auswahlermessen')],
      [createErmessensspielraum('spielraum-1', 'ermessensentscheidung')],
      [createErmessensart('art-1', 'auswahlermessen')],
    );

    expect(badges).toEqual(['Auswahlermessen', 'Ermessensentscheidung']);
  });

  it('names both kinds of discretion when the stored type is beides', () => {
    const badges = getRechtsfolgeBadges(
      [],
      [createErmessensspielraum('spielraum-1', 'ermessensentscheidung')],
      [createErmessensart('art-1', 'beides')],
    );

    expect(badges).toEqual([
      'Ermessensentscheidung',
      'Auswahlermessen',
      'Entschließungsermessen',
    ]);
  });

  it('shows no combined value when the stored type is beides', () => {
    const badges = getRechtsfolgeBadges(
      [],
      [],
      [createErmessensart('art-1', ' Beides ')],
    );

    expect(badges).not.toContain('Beides');
    expect(badges).toEqual(['Auswahlermessen', 'Entschließungsermessen']);
  });

  it('names both kinds only once when two legal effects report beides', () => {
    const badges = getRechtsfolgeBadges(
      [],
      [],
      [
        createErmessensart('art-1', 'beides'),
        createErmessensart('art-2', 'beides'),
      ],
    );

    expect(badges).toEqual(['Auswahlermessen', 'Entschließungsermessen']);
  });
});
