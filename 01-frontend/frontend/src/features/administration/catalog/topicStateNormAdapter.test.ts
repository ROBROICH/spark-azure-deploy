import { describe, expect, it } from 'vitest';

import type {
  CatalogNorm,
  GesetzesgrundlageDocument,
} from '../data/usecaseApi';
import {
  countTopicStateNorms,
  encodePrivateTopicGroupName,
  materializeTopicStateSelection,
  readTopicStateNormsByState,
  removeTopicStatePersistence,
  renameTopicStatePersistence,
} from './topicStateNormAdapter';

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

const document = (
  overrides: Partial<GesetzesgrundlageDocument> = {},
): GesetzesgrundlageDocument => ({
  topics: [],
  stateNormGroups: {},
  topicStateGroups: {},
  ...overrides,
});

describe('topicStateNormAdapter', () => {
  it('maps Bayern, Baden-Württemberg, and Hamburg to BY, BW, and HH keys', () => {
    const privateName = encodePrivateTopicGroupName('Waldschutz');
    const next = materializeTopicStateSelection(document(), 'Waldschutz', {
      BY: [norm('BayWaldG', '1')],
      BW: [norm('LWaldG BW', '1')],
      HH: [norm('LWaldG HH', '1')],
    });

    expect(next.topicStateGroups.Waldschutz).toEqual([privateName]);
    expect(next.stateNormGroups[`${privateName}|BY`]?.[0]?.jurabk).toBe(
      'BayWaldG',
    );
    expect(next.stateNormGroups[`${privateName}|BW`]?.[0]?.jurabk).toBe(
      'LWaldG BW',
    );
    expect(next.stateNormGroups[`${privateName}|HH`]?.[0]?.jurabk).toBe(
      'LWaldG HH',
    );
    expect(
      Object.keys(next.stateNormGroups).some((key) => key.endsWith('|Bayern')),
    ).toBe(false);
  });

  it('reads the union of a legacy full-name key and a code alias', () => {
    const current = document({
      stateNormGroups: {
        'LwaldG|Bayern': [norm('BayWaldG', '1')],
        'LwaldG|BY': [norm('BayWaldG', '2'), norm('BayWaldG', '1')],
        'LwaldG|BW': [norm('LWaldG BW', '1')],
      },
      topicStateGroups: { Waldschutz: ['LwaldG'] },
    });

    const byState = readTopicStateNormsByState(current, 'Waldschutz');
    expect(byState.BY).toEqual([norm('BayWaldG', '1'), norm('BayWaldG', '2')]);
    expect(byState.BW).toEqual([norm('LWaldG BW', '1')]);
    expect(countTopicStateNorms(current, 'Waldschutz')).toBe(3);
  });

  it('preserves legacy groups byte-for-byte until the first state-selection change', () => {
    const legacy = {
      'LwaldG|Bayern': [norm('BayWaldG', '1')],
      'LwaldG|BY': [norm('BayWaldG', '2')],
    };
    const current = document({
      stateNormGroups: legacy,
      topicStateGroups: { Waldschutz: ['LwaldG'] },
    });

    expect(JSON.stringify(current.stateNormGroups)).toBe(
      JSON.stringify(legacy),
    );

    const materialized = materializeTopicStateSelection(current, 'Waldschutz', {
      BY: [norm('BayWaldG', '1'), norm('BayWaldG', '2')],
    });
    const privateName = encodePrivateTopicGroupName('Waldschutz');
    expect(materialized.stateNormGroups[`${privateName}|BY`]).toEqual([
      norm('BayWaldG', '1'),
      norm('BayWaldG', '2'),
    ]);
    expect(materialized.stateNormGroups['LwaldG|Bayern']).toBeUndefined();
    expect(materialized.stateNormGroups['LwaldG|BY']).toBeUndefined();
  });

  it('keeps a shared legacy group while another topic still uses it', () => {
    const current = document({
      stateNormGroups: {
        'LwaldG|BY': [norm('BayWaldG', '1')],
        'LwaldG|BW': [norm('LWaldG BW', '1')],
      },
      topicStateGroups: {
        Waldschutz: ['LwaldG'],
        Forstwirtschaft: ['LwaldG'],
      },
    });

    const next = materializeTopicStateSelection(current, 'Waldschutz', {
      BY: [norm('BayWaldG', '9')],
    });
    const privateName = encodePrivateTopicGroupName('Waldschutz');

    expect(next.topicStateGroups.Waldschutz).toEqual([privateName]);
    expect(next.topicStateGroups.Forstwirtschaft).toEqual(['LwaldG']);
    expect(next.stateNormGroups['LwaldG|BY']).toEqual([norm('BayWaldG', '1')]);
    expect(next.stateNormGroups['LwaldG|BW']).toEqual([norm('LWaldG BW', '1')]);
    expect(next.stateNormGroups[`${privateName}|BY`]).toEqual([
      norm('BayWaldG', '9'),
    ]);
  });

  it('removes only the private full-name alias after a canonical write', () => {
    const privateName = encodePrivateTopicGroupName('Waldschutz');
    const current = document({
      stateNormGroups: {
        [`${privateName}|Bayern`]: [norm('BayWaldG', '1')],
        [`${privateName}|BY`]: [norm('BayWaldG', '2')],
        'LwaldG|Bayern': [norm('Shared', '1')],
      },
      topicStateGroups: {
        Waldschutz: [privateName],
        Forstwirtschaft: ['LwaldG'],
      },
    });

    const next = materializeTopicStateSelection(current, 'Waldschutz', {
      BY: [norm('BayWaldG', '1'), norm('BayWaldG', '2')],
    });

    expect(next.stateNormGroups[`${privateName}|BY`]).toEqual([
      norm('BayWaldG', '1'),
      norm('BayWaldG', '2'),
    ]);
    expect(next.stateNormGroups[`${privateName}|Bayern`]).toBeUndefined();
    expect(next.stateNormGroups['LwaldG|Bayern']).toEqual([
      norm('Shared', '1'),
    ]);
  });

  it('renames private group keys with the topic and encodes separators safely', () => {
    const fromPrivate = encodePrivateTopicGroupName('Wald|schutz');
    const toPrivate = encodePrivateTopicGroupName('Wald / Schutz');
    const current = document({
      stateNormGroups: {
        [`${fromPrivate}|BY`]: [norm('BayWaldG', '1')],
        'LwaldG|BY': [norm('Shared', '1')],
      },
      topicStateGroups: {
        'Wald|schutz': [fromPrivate],
      },
    });

    expect(fromPrivate.includes('|')).toBe(false);
    const next = renameTopicStatePersistence(
      current,
      'Wald|schutz',
      'Wald / Schutz',
    );

    expect(next.topicStateGroups['Wald / Schutz']).toEqual([toPrivate]);
    expect(next.topicStateGroups['Wald|schutz']).toBeUndefined();
    expect(next.stateNormGroups[`${toPrivate}|BY`]).toEqual([
      norm('BayWaldG', '1'),
    ]);
    expect(next.stateNormGroups[`${fromPrivate}|BY`]).toBeUndefined();
    expect(next.stateNormGroups['LwaldG|BY']).toEqual([norm('Shared', '1')]);
  });

  it('removes unreferenced private groups with the topic and keeps shared groups', () => {
    const privateName = encodePrivateTopicGroupName('Waldschutz');
    const current = document({
      stateNormGroups: {
        [`${privateName}|BY`]: [norm('BayWaldG', '1')],
        'LwaldG|BY': [norm('Shared', '1')],
      },
      topicStateGroups: {
        Waldschutz: [privateName],
        Forstwirtschaft: ['LwaldG'],
      },
    });

    const next = removeTopicStatePersistence(current, 'Waldschutz');
    expect(next.topicStateGroups.Waldschutz).toBeUndefined();
    expect(next.stateNormGroups[`${privateName}|BY`]).toBeUndefined();
    expect(next.topicStateGroups.Forstwirtschaft).toEqual(['LwaldG']);
    expect(next.stateNormGroups['LwaldG|BY']).toEqual([norm('Shared', '1')]);
  });

  it('preserves legacy bytes when their last topic assignment is removed', () => {
    const legacy = {
      'LwaldG|Bayern': [norm('BayWaldG', '1')],
      'LwaldG|BY': [norm('BayWaldG', '2')],
    };
    const current = document({
      stateNormGroups: legacy,
      topicStateGroups: { Waldschutz: ['LwaldG'] },
    });

    const next = removeTopicStatePersistence(current, 'Waldschutz');

    expect(next.topicStateGroups.Waldschutz).toBeUndefined();
    expect(next.stateNormGroups).toEqual(legacy);
    expect(JSON.stringify(next.stateNormGroups)).toBe(JSON.stringify(legacy));
  });

  it('keeps a private group while another topic still references it', () => {
    const privateName = encodePrivateTopicGroupName('Waldschutz');
    const current = document({
      stateNormGroups: {
        [`${privateName}|BY`]: [norm('BayWaldG', '1')],
      },
      topicStateGroups: {
        Waldschutz: [privateName],
        Forstwirtschaft: [privateName],
      },
    });

    const next = removeTopicStatePersistence(current, 'Waldschutz');

    expect(next.topicStateGroups.Forstwirtschaft).toEqual([privateName]);
    expect(next.stateNormGroups[`${privateName}|BY`]).toEqual([
      norm('BayWaldG', '1'),
    ]);
  });
});
