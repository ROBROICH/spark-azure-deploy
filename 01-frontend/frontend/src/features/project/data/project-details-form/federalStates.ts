import type { GermanState } from '@/api-clients/pls-module/types.gen';

export const federalStateCodes = [
  'BY',
  'BW',
  'BE',
  'BB',
  'HB',
  'HH',
  'HE',
  'MV',
  'NI',
  'NW',
  'RP',
  'SL',
  'SN',
  'ST',
  'SH',
  'TH',
] as const;

export type FederalStateCode = (typeof federalStateCodes)[number];

export const germanStateByCode = {
  BY: 'Bayern',
  BW: 'Baden-Württemberg',
  BE: 'Berlin',
  BB: 'Brandenburg',
  HB: 'Bremen',
  HH: 'Hamburg',
  HE: 'Hessen',
  MV: 'Mecklenburg-Vorpommern',
  NI: 'Niedersachsen',
  NW: 'Nordrhein-Westfalen',
  RP: 'Rheinland-Pfalz',
  SL: 'Saarland',
  SN: 'Sachsen',
  ST: 'Sachsen-Anhalt',
  SH: 'Schleswig-Holstein',
  TH: 'Thüringen',
} satisfies Record<FederalStateCode, GermanState>;

export const germanStates = Object.values(germanStateByCode) as [
  GermanState,
  ...GermanState[],
];

export function isFederalStateCode(value: string): value is FederalStateCode {
  return federalStateCodes.includes(value as FederalStateCode);
}
