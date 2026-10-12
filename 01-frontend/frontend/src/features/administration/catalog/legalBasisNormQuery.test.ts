import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  fetchAllLegalBasisNormPages,
  filterFederalLegalBasisNorms,
  filterStateLegalBasisNorms,
  LEGAL_BASIS_NORMS_PAGE_SIZE,
  unwrapLegalBasisNormPage,
  type LegalBasisNormItem,
} from './legalBasisNormQuery';

const getLegalBasisNormsMock = vi.hoisted(() => vi.fn());

vi.mock('@/api-clients/backend', () => ({
  v1ExaminationGetLegalBasisNorms: (...args: unknown[]) =>
    getLegalBasisNormsMock(...args),
}));

const item = (
  overrides: Partial<LegalBasisNormItem> &
    Pick<LegalBasisNormItem, 'jurabk' | 'paragraphNr' | 'bundesland'>,
): LegalBasisNormItem => ({
  paragraphTitel: null,
  gesetzTitel: null,
  gesetzKurztitel: null,
  doknr: null,
  dokumentTyp: null,
  gesetz: {
    nodeType: 'gesetz',
    id: `law-${overrides.jurabk}`,
    name: overrides.jurabk,
    jurabk: overrides.jurabk,
    titel: null,
    kurztitel: null,
    doknr: null,
    bundesland: overrides.bundesland,
    dokumentTyp: null,
    fundstelle: null,
    standangaben: [],
  },
  norm: {
    nodeType: 'norm',
    id: `norm-${overrides.jurabk}-${overrides.paragraphNr}`,
    gesetzId: `law-${overrides.jurabk}`,
    paragraphNr: overrides.paragraphNr,
    paragraphTitel: null,
    text: null,
    regelungsgegenstand: null,
    doknr: null,
    prev: null,
    next: null,
    frontendParentIds: [],
    isOutdated: false,
  },
  isDeconstructed: false,
  deconstructionId: null,
  deconstructionCreatedAt: null,
  ...overrides,
});

describe('legalBasisNormQuery', () => {
  beforeEach(() => {
    getLegalBasisNormsMock.mockReset();
  });

  it('keeps federal entries including isDeconstructed false and drops state laws', () => {
    const federal = item({
      jurabk: 'BNatSchG',
      paragraphNr: '44',
      bundesland: null,
      isDeconstructed: false,
    });
    const state = item({
      jurabk: 'BayWaldG',
      paragraphNr: '1',
      bundesland: 'BY',
    });

    expect(filterFederalLegalBasisNorms([federal, state])).toEqual([federal]);
  });

  it('keeps only the requested state and never another state law', () => {
    const by = item({
      jurabk: 'BayWaldG',
      paragraphNr: '1',
      bundesland: 'BY',
    });
    const bw = item({
      jurabk: 'LWaldG BW',
      paragraphNr: '1',
      bundesland: 'BW',
    });

    expect(filterStateLegalBasisNorms([by, bw], 'BY')).toEqual([by]);
    expect(filterStateLegalBasisNorms([by, bw], 'BW')).toEqual([bw]);
  });

  it('follows pagination until a short page arrives', async () => {
    const firstPage = Array.from(
      { length: LEGAL_BASIS_NORMS_PAGE_SIZE },
      (_, index) =>
        item({
          jurabk: 'BNatSchG',
          paragraphNr: String(index + 1),
          bundesland: null,
        }),
    );
    const secondPage = [
      item({ jurabk: 'EnWG', paragraphNr: '17', bundesland: null }),
    ];
    getLegalBasisNormsMock
      .mockResolvedValueOnce({ data: firstPage })
      .mockResolvedValueOnce({ data: secondPage });

    const items = await fetchAllLegalBasisNormPages({ jurabk: 'BNatSchG' });

    expect(items).toHaveLength(LEGAL_BASIS_NORMS_PAGE_SIZE + 1);
    expect(getLegalBasisNormsMock).toHaveBeenNthCalledWith(1, {
      query: {
        bundesland: undefined,
        jurabk: 'BNatSchG',
        offset: 0,
        limit: LEGAL_BASIS_NORMS_PAGE_SIZE,
      },
      throwOnError: true,
    });
    expect(getLegalBasisNormsMock).toHaveBeenNthCalledWith(2, {
      query: {
        bundesland: undefined,
        jurabk: 'BNatSchG',
        offset: LEGAL_BASIS_NORMS_PAGE_SIZE,
        limit: LEGAL_BASIS_NORMS_PAGE_SIZE,
      },
      throwOnError: true,
    });
  });

  it('unwraps either a bare page or a data envelope', () => {
    const page = [
      item({ jurabk: 'EnWG', paragraphNr: '17', bundesland: null }),
    ];
    expect(unwrapLegalBasisNormPage(page)).toEqual(page);
    expect(unwrapLegalBasisNormPage({ data: page })).toEqual(page);
  });
});
