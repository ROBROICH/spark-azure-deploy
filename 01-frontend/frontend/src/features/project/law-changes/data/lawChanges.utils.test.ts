import { describe, expect, it } from 'vitest';
import type { DetailedLawChangeApiResponse } from './lawChanges.types';
import {
  getLawChangeNormLabel,
  getLawChangeMatchesForNorm,
  isDetailedLawChangesResponse,
  normalizeLawChangesResponse,
} from './lawChanges.utils';

const LAW_CHANGES_RESPONSE_WITH_ALPHA_SUFFIX: DetailedLawChangeApiResponse[] = [
  {
    jurabk: 'BNatSchG',
    affected_norms: [
      {
        change_text: '§ 45a wird gestrichen.',
        current_text:
          'Das Füttern und Anlocken mit Futter von wildlebenden Exemplaren der Art Wolf (Canis lupus) ist verboten. Ausgenommen sind Maßnahmen der für Naturschutz und Landschaftspflege zuständigen Behörde. § 45 Absatz 5 findet keine Anwendung.\n§ 45 Absatz 7 Satz 1 Nummer 1 gilt mit der Maßgabe, dass, wenn Schäden bei Nutztierrissen keinem bestimmten Wolf eines Rudels zugeordnet worden sind, der Abschuss von einzelnen Mitgliedern des Wolfsrudels in engem räumlichem und zeitlichem Zusammenhang mit bereits eingetretenen Rissereignissen auch ohne Zuordnung der Schäden zu einem bestimmten Einzeltier bis zum Ausbleiben von Schäden fortgeführt werden darf. Ernste wirtschaftliche Schäden im Sinne von § 45 Absatz 7 Satz 1 Nummer 1 können auch drohen, wenn ein Wolf nicht landwirtschaftlich gehaltene Weidetiere reißt, soweit diese durch zumutbare Herdenschutzmaßnahmen geschützt waren. Die in Satz 1 geregelte Möglichkeit des Abschusses weiterer Wölfe gilt auch für Entnahmen im Interesse der Gesundheit des Menschen nach § 45 Absatz 7 Satz 1 Nummer 4. Die Anforderungen des § 45 Absatz 7 Satz 2 und 3 sind zu beachten.\nVorkommen von Hybriden zwischen Wolf und Hund (Wolfshybriden) in der freien Natur sind durch die für Naturschutz und Landschaftspflege zuständige Behörde zu entnehmen; die Verbote des § 44 Absatz 1 Nummer 1 gelten insoweit nicht.\nBei der Bestimmung von geeigneten Personen, die eine Entnahme von Wölfen nach Erteilung einer Ausnahme gemäß § 45 Absatz 7, auch in Verbindung mit Absatz 2, sowie nach Absatz 3 durchführen, berücksichtigt die für Naturschutz und Landschaftspflege zuständige Behörde nach Möglichkeit die Jagdausübungsberechtigten, soweit diese ihr Einverständnis hierzu erteilen. Erfolgt die Entnahme nicht durch die Jagdausübungsberechtigten, sind die Maßnahmen zur Durchführung der Entnahme durch die Jagdausübungsberechtigten zu dulden. Die Jagdausübungsberechtigten sind in geeigneter Weise vor Beginn über Maßnahmen zur Entnahme zu benachrichtigen; ihnen ist nach Möglichkeit Gelegenheit zur Unterstützung bei der Durchführung der Entnahme zu geben. Bei Gefahr im Verzug bedarf es der vorherigen Benachrichtigung nach Satz 3 nicht.',
        transitional_note: '',
        new_text: '(weggefallen)',
        paragraph_nr: '45a',
      },
    ],
    valid_from: '2026-03-29',
  } as DetailedLawChangeApiResponse,
];

const LAW_CHANGES_RESPONSE_WITH_SAME_NORM_AND_DATE: DetailedLawChangeApiResponse[] =
  [
    {
      jurabk: 'BNatSchG',
      affected_norms: [
        {
          change_text: 'Erste Aenderung.',
          current_text: 'Alter Text 1',
          transitional_note: '',
          new_text: 'Neuer Text 1',
          paragraph_nr: '44',
        },
        {
          change_text: 'Zweite Aenderung.',
          current_text: 'Alter Text 2',
          transitional_note: 'Mit Uebergangsregelung',
          new_text: 'Neuer Text 2',
          paragraph_nr: '44',
        },
      ],
      valid_from: '2026-05-23',
    } as DetailedLawChangeApiResponse,
  ];

const LAW_CHANGES_RESPONSE_WITH_ONE_LETTER_DIFFERENCE: DetailedLawChangeApiResponse[] =
  [
    {
      jurabk: 'BNatSchG',
      affected_norms: [
        {
          change_text: '§ 45a wird gestrichen.',
          current_text: 'Bestehender Normtext.',
          transitional_note: '',
          new_text: '(weggefallen)',
          paragraph_nr: '45a',
        },
        {
          change_text: '§ 45b wird gestrichen.',
          current_text: 'Bestehender Normtext.',
          transitional_note: '',
          new_text: '(weggefallen)',
          paragraph_nr: '45b',
        },
      ],
      valid_from: '2026-03-29',
    } as DetailedLawChangeApiResponse,
  ];

describe('lawChanges.utils', () => {
  it('does not match a law change with alphabetic paragraph suffix to the leading paragraph number', () => {
    const lawChanges = normalizeLawChangesResponse(
      LAW_CHANGES_RESPONSE_WITH_ALPHA_SUFFIX,
    );

    const matches = getLawChangeMatchesForNorm(lawChanges, {
      jurabk: 'BNatSchG',
      paragraphNr: '45',
    });

    expect(matches).toHaveLength(0);
  });

  it('matches a law change with alphabetic paragraph suffix exactly', () => {
    const lawChanges = normalizeLawChangesResponse(
      LAW_CHANGES_RESPONSE_WITH_ALPHA_SUFFIX,
    );

    const matches = getLawChangeMatchesForNorm(lawChanges, {
      jurabk: 'BNatSchG',
      paragraphNr: '45a',
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.paragraphNr).toBe('45a');
  });

  it('keeps adjacent paragraph suffixes separate', () => {
    const lawChanges = normalizeLawChangesResponse(
      LAW_CHANGES_RESPONSE_WITH_ONE_LETTER_DIFFERENCE,
    );

    expect(
      getLawChangeMatchesForNorm(lawChanges, {
        jurabk: 'BNatSchG',
        paragraphNr: '45',
      }),
    ).toHaveLength(0);

    expect(
      getLawChangeMatchesForNorm(lawChanges, {
        jurabk: 'BNatSchG',
        paragraphNr: '45a',
      }).map((lawChange) => lawChange.paragraphNr),
    ).toEqual(['45a']);

    expect(
      getLawChangeMatchesForNorm(lawChanges, {
        jurabk: 'BNatSchG',
        paragraphNr: '45b',
      }).map((lawChange) => lawChange.paragraphNr),
    ).toEqual(['45b']);
  });

  it('normalizes paragraph prefixes before exact matching', () => {
    const lawChanges = normalizeLawChangesResponse(
      LAW_CHANGES_RESPONSE_WITH_ALPHA_SUFFIX,
    );

    const matches = getLawChangeMatchesForNorm(lawChanges, {
      jurabk: 'BNatSchG',
      paragraphNr: '§ 45a',
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]?.paragraphNr).toBe('45a');
  });

  it('formats law change norm labels with paragraph before law abbreviation', () => {
    expect(
      getLawChangeNormLabel({
        jurabk: 'BNatSchG',
        paragraphNr: '45a',
      }),
    ).toBe('§ 45a BNatSchG');

    expect(
      getLawChangeNormLabel({
        jurabk: 'BNatSchG',
        paragraphNr: '§ 45',
      }),
    ).toBe('§ 45 BNatSchG');
  });

  it('does not match different paragraph numbers', () => {
    const lawChanges = normalizeLawChangesResponse(
      LAW_CHANGES_RESPONSE_WITH_ALPHA_SUFFIX,
    );

    expect(
      getLawChangeMatchesForNorm(lawChanges, {
        jurabk: 'BNatSchG',
        paragraphNr: '4',
      }),
    ).toHaveLength(0);

    expect(
      getLawChangeMatchesForNorm(lawChanges, {
        jurabk: 'BNatSchG',
        paragraphNr: '5',
      }),
    ).toHaveLength(0);
  });

  it('creates different ids for multiple changes on the same norm and date', () => {
    const lawChanges = normalizeLawChangesResponse(
      LAW_CHANGES_RESPONSE_WITH_SAME_NORM_AND_DATE,
    );

    expect(lawChanges).toHaveLength(2);
    expect(lawChanges[0]?.id).not.toBe(lawChanges[1]?.id);
    expect(lawChanges[0]?.id).toMatch(/^BNatSchG__44__2026-05-23__/);
    expect(lawChanges[1]?.id).toMatch(/^BNatSchG__44__2026-05-23__/);
  });

  it('creates different ids when the content differs by a single letter', () => {
    const lawChanges = normalizeLawChangesResponse(
      LAW_CHANGES_RESPONSE_WITH_ONE_LETTER_DIFFERENCE,
    );

    expect(lawChanges).toHaveLength(2);
    expect(lawChanges[0]?.id).not.toBe(lawChanges[1]?.id);
    expect(lawChanges[0]?.changeText).toBe('§ 45a wird gestrichen.');
    expect(lawChanges[1]?.changeText).toBe('§ 45b wird gestrichen.');
  });

  it('accepts detailed law-change responses with affected norm objects', () => {
    expect(
      isDetailedLawChangesResponse(LAW_CHANGES_RESPONSE_WITH_ALPHA_SUFFIX),
    ).toBe(true);
  });

  it('rejects basic law-change responses that contain string-only affected norms', () => {
    expect(
      isDetailedLawChangesResponse([
        {
          jurabk: 'BNatSchG',
          affected_norms: ['§ 45a'],
          valid_from: '2026-03-29',
        },
      ]),
    ).toBe(false);
  });

  it('rejects mixed basic and detailed affected norm responses', () => {
    expect(
      isDetailedLawChangesResponse([
        {
          jurabk: 'BNatSchG',
          affected_norms: [
            {
              change_text: '§ 45a wird gestrichen.',
              current_text: 'Bestehender Normtext.',
              transitional_note: '',
              new_text: '(weggefallen)',
              paragraph_nr: '45a',
            },
            '§ 45b',
          ],
          valid_from: '2026-03-29',
        },
      ] as unknown as Parameters<typeof isDetailedLawChangesResponse>[0]),
    ).toBe(false);
  });
});
