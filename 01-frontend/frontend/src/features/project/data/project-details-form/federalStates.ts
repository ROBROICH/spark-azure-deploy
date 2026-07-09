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

export const federalStateCodeByGermanState = {
  Bayern: 'BY',
  'Baden-Württemberg': 'BW',
  Berlin: 'BE',
  Brandenburg: 'BB',
  Bremen: 'HB',
  Hamburg: 'HH',
  Hessen: 'HE',
  'Mecklenburg-Vorpommern': 'MV',
  Niedersachsen: 'NI',
  'Nordrhein-Westfalen': 'NW',
  'Rheinland-Pfalz': 'RP',
  Saarland: 'SL',
  Sachsen: 'SN',
  'Sachsen-Anhalt': 'ST',
  'Schleswig-Holstein': 'SH',
  Thüringen: 'TH',
} satisfies Record<GermanState, FederalStateCode>;

export const germanStates = Object.values(germanStateByCode) as [
  GermanState,
  ...GermanState[],
];

export function isFederalStateCode(value: string): value is FederalStateCode {
  return federalStateCodes.includes(value as FederalStateCode);
}
