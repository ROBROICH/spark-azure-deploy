import type { FederalStateCode } from '@/features/project/data/project-details-form/federalStates';

export const STATE_NORM_GROUP_KEY_SEPARATOR = '|';

export const makeStateNormGroupKey = (
  groupName: string,
  stateCode: FederalStateCode,
): string => `${groupName}${STATE_NORM_GROUP_KEY_SEPARATOR}${stateCode}`;

export type ParsedStateNormGroupKey = {
  groupName: string;
  state: string;
};

export const parseStateNormGroupKey = (
  key: string,
): ParsedStateNormGroupKey | null => {
  const separatorIndex = key.lastIndexOf(STATE_NORM_GROUP_KEY_SEPARATOR);
  if (separatorIndex <= 0 || separatorIndex === key.length - 1) {
    return null;
  }

  return {
    groupName: key.slice(0, separatorIndex),
    state: key.slice(separatorIndex + 1),
  };
};
