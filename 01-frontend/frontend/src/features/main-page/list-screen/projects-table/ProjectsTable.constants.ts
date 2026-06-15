export const ANLAGE_FILTER_VALUES = ['spark', 'fpp'] as const;
export type AnlageFilterValue = (typeof ANLAGE_FILTER_VALUES)[number];
