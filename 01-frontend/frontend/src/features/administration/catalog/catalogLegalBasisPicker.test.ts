import { describe, expect, it } from 'vitest';

import { normIdentityKey } from './catalogDraftValidation';
import {
  toPickerGroups,
  toggleGroupSelection,
  withUnavailablePersistedNorms,
} from './catalogLegalBasisPicker';
import type { LegalBasisNormItem } from './legalBasisNormQuery';

const item = (
  jurabk: string,
  paragraphNr: string,
  bundesland: string | null,
): LegalBasisNormItem => ({
  jurabk,
  paragraphNr,
  paragraphTitel: `Title ${paragraphNr}`,
  gesetzTitel: null,
  gesetzKurztitel: null,
  doknr: null,
  bundesland,
  dokumentTyp: null,
  gesetz: {
    nodeType: 'gesetz',
    id: `law-${jurabk}`,
    name: jurabk,
    jurabk,
    titel: null,
    kurztitel: null,
    doknr: null,
    bundesland,
    dokumentTyp: null,
    fundstelle: null,
    standangaben: [],
  },
  norm: {
    nodeType: 'norm',
    id: `norm-${jurabk}-${paragraphNr}`,
    gesetzId: `law-${jurabk}`,
    paragraphNr,
    paragraphTitel: `Title ${paragraphNr}`,
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
});

describe('catalogLegalBasisPicker grouping', () => {
  it('groups norms under their law and keeps non-deconstructed entries', () => {
    const { groups } = toPickerGroups(
      [item('BNatSchG', '44', null), item('BNatSchG', '45', null)],
      null,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('BNatSchG');
    expect(groups[0]?.norms).toHaveLength(2);
  });

  it('marks persisted refs that are missing from the current database as unavailable', () => {
    const built = toPickerGroups([item('BNatSchG', '44', null)], null);
    const persisted = {
      jurabk: 'OldG',
      paragraphNr: '1',
      absatz: '2',
      satz: null,
      nummer: null,
    };
    const next = withUnavailablePersistedNorms(built.groups, built.normsById, [
      persisted,
    ]);
    const unavailable = next.groups.find((group) => group.label === 'OldG');
    expect(unavailable?.norms[0]?.unavailable).toBe(true);
    expect(unavailable?.norms[0]?.id).toBe(normIdentityKey(persisted));
  });

  it('never reselects a cleared unavailable ref through the parent action', () => {
    const groupIds = ['available', 'unavailable'];
    const selectableIds = ['available'];

    expect(toggleGroupSelection(new Set(), groupIds, selectableIds)).toEqual(
      new Set(['available']),
    );
    expect(
      toggleGroupSelection(new Set(['available']), groupIds, selectableIds),
    ).toEqual(new Set());
    expect(
      toggleGroupSelection(
        new Set(['available', 'unavailable']),
        groupIds,
        selectableIds,
      ),
    ).toEqual(new Set());
  });
});
