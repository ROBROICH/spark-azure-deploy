import { describe, expect, it } from 'vitest';

import type { CatalogNorm } from '../data/usecaseApi';
import { countUniqueNorms } from './catalogDraftValidation';
import { applyFederalNormSelection } from './federalNormSelection';

const norm = (
  jurabk: string,
  paragraphNr: string,
  extras: Partial<CatalogNorm> = {},
): CatalogNorm => ({
  jurabk,
  paragraphNr,
  absatz: extras.absatz ?? null,
  satz: extras.satz ?? null,
  nummer: extras.nummer ?? null,
});

describe('applyFederalNormSelection', () => {
  it('keeps unchanged refs in their original lists and adds new refs to pruefungsNorms', () => {
    const existingPruefung = [norm('BNatSchG', '44')];
    const existingVerfahren = [norm('VwVfG', '36')];
    const selected = [
      norm('BNatSchG', '44'),
      norm('VwVfG', '36'),
      norm('EnWG', '17'),
    ];

    expect(
      applyFederalNormSelection(existingPruefung, existingVerfahren, selected),
    ).toEqual({
      pruefungsNorms: [norm('BNatSchG', '44'), norm('EnWG', '17')],
      verfahrensNorms: [norm('VwVfG', '36')],
    });
  });

  it('removes a cleared ref from both lists', () => {
    const existingPruefung = [norm('BNatSchG', '44'), norm('EnWG', '17')];
    const existingVerfahren = [norm('VwVfG', '36'), norm('BNatSchG', '44')];

    expect(
      applyFederalNormSelection(existingPruefung, existingVerfahren, [
        norm('EnWG', '17'),
      ]),
    ).toEqual({
      pruefungsNorms: [norm('EnWG', '17')],
      verfahrensNorms: [],
    });
  });

  it('counts the same five-field identity once across both lists', () => {
    expect(
      countUniqueNorms([
        [norm('VwVfG', '36')],
        [norm('VwVfG', '36'), norm('VwVfG', '74', { absatz: '2', satz: '3' })],
      ]),
    ).toBe(2);
  });

  it('keeps an unavailable persisted ref until it is cleared', () => {
    const unavailable = norm('OldG', '1', { absatz: '2' });
    const next = applyFederalNormSelection(
      [unavailable],
      [],
      [unavailable, norm('BNatSchG', '44')],
    );

    expect(next.pruefungsNorms).toEqual([unavailable, norm('BNatSchG', '44')]);
  });
});
