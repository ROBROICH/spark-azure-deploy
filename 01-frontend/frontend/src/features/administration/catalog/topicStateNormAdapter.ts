import {
  federalStateCodeByGermanState,
  federalStateCodes,
  isFederalStateCode,
  isGermanState,
  type FederalStateCode,
} from '@/features/project/data/project-details-form/federalStates';

import type {
  CatalogNorm,
  GesetzesgrundlageDocument,
} from '../data/usecaseApi';
import {
  dedupeNormsByIdentity,
  normIdentityKey,
} from './catalogDraftValidation';
import {
  makeStateNormGroupKey,
  parseStateNormGroupKey,
  STATE_NORM_GROUP_KEY_SEPARATOR,
} from './stateNormGroups.logic';

export const PRIVATE_TOPIC_GROUP_PREFIX = '__topic__:';

export const encodePrivateTopicGroupName = (topicName: string): string =>
  `${PRIVATE_TOPIC_GROUP_PREFIX}${encodeURIComponent(topicName)}`;

export const isPrivateTopicGroupName = (groupName: string): boolean =>
  groupName.startsWith(PRIVATE_TOPIC_GROUP_PREFIX);

export const canonicalizeStateCode = (
  state: string,
): FederalStateCode | null => {
  if (isFederalStateCode(state)) {
    return state;
  }
  if (isGermanState(state)) {
    return federalStateCodeByGermanState[state];
  }
  return null;
};

const referencedGroupNames = (
  topicStateGroups: Record<string, string[]>,
): Set<string> => {
  const names = new Set<string>();
  for (const groups of Object.values(topicStateGroups)) {
    for (const groupName of groups) {
      names.add(groupName);
    }
  }
  return names;
};

const keysForGroupAndState = (
  stateNormGroups: Record<string, CatalogNorm[]>,
  groupName: string,
  stateCode: FederalStateCode,
): string[] => {
  const keys: string[] = [];
  for (const key of Object.keys(stateNormGroups)) {
    const parsed = parseStateNormGroupKey(key);
    if (
      parsed?.groupName === groupName &&
      canonicalizeStateCode(parsed.state) === stateCode &&
      !keys.includes(key)
    ) {
      keys.push(key);
    }
  }

  return keys;
};

const unionGroupStateNorms = (
  stateNormGroups: Record<string, CatalogNorm[]>,
  groupName: string,
  stateCode: FederalStateCode,
): CatalogNorm[] => {
  const lists = keysForGroupAndState(
    stateNormGroups,
    groupName,
    stateCode,
  ).flatMap((key) => stateNormGroups[key] ?? []);
  return dedupeNormsByIdentity(lists);
};

export const readTopicStateNormsByState = (
  document: Pick<
    GesetzesgrundlageDocument,
    'stateNormGroups' | 'topicStateGroups'
  >,
  topicName: string,
): Record<FederalStateCode, CatalogNorm[]> => {
  const assigned = document.topicStateGroups[topicName] ?? [];
  const byState = {} as Record<FederalStateCode, CatalogNorm[]>;

  for (const stateCode of federalStateCodes) {
    const lists = assigned.map((groupName) =>
      unionGroupStateNorms(document.stateNormGroups, groupName, stateCode),
    );
    byState[stateCode] = dedupeNormsByIdentity(lists.flat());
  }

  return byState;
};

export const countTopicStateNorms = (
  document: Pick<
    GesetzesgrundlageDocument,
    'stateNormGroups' | 'topicStateGroups'
  >,
  topicName: string,
): number => {
  const identities = new Set<string>();
  for (const norms of Object.values(
    readTopicStateNormsByState(document, topicName),
  )) {
    for (const norm of norms) {
      identities.add(normIdentityKey(norm));
    }
  }
  return identities.size;
};

const removeGroupKeys = (
  stateNormGroups: Record<string, CatalogNorm[]>,
  groupName: string,
): void => {
  for (const key of Object.keys(stateNormGroups)) {
    const parsed = parseStateNormGroupKey(key);
    if (parsed?.groupName === groupName) {
      delete stateNormGroups[key];
    }
  }
};

const removeUnreferencedLegacyGroups = (
  stateNormGroups: Record<string, CatalogNorm[]>,
  topicStateGroups: Record<string, string[]>,
  candidateGroupNames: ReadonlyArray<string>,
): void => {
  const stillReferenced = referencedGroupNames(topicStateGroups);
  for (const groupName of candidateGroupNames) {
    if (isPrivateTopicGroupName(groupName)) {
      continue;
    }
    if (stillReferenced.has(groupName)) {
      continue;
    }
    removeGroupKeys(stateNormGroups, groupName);
  }
};

/**
 * Writes one topic's state selection into its private backing group. Legacy
 * shared groups stay untouched while another topic still references them.
 */
export const materializeTopicStateSelection = (
  document: Pick<
    GesetzesgrundlageDocument,
    'stateNormGroups' | 'topicStateGroups'
  >,
  topicName: string,
  selectedByState: Partial<
    Record<FederalStateCode, ReadonlyArray<CatalogNorm>>
  >,
): Pick<GesetzesgrundlageDocument, 'stateNormGroups' | 'topicStateGroups'> => {
  const privateGroupName = encodePrivateTopicGroupName(topicName);
  const previousAssigned = document.topicStateGroups[topicName] ?? [];
  const nextStateNormGroups = { ...document.stateNormGroups };
  const nextTopicStateGroups = { ...document.topicStateGroups };

  for (const stateCode of federalStateCodes) {
    const canonicalKey = makeStateNormGroupKey(privateGroupName, stateCode);
    const selected = dedupeNormsByIdentity(selectedByState[stateCode] ?? []);

    const aliasKeys = keysForGroupAndState(
      nextStateNormGroups,
      privateGroupName,
      stateCode,
    ).filter((aliasKey) => aliasKey !== canonicalKey);
    for (const aliasKey of aliasKeys) {
      delete nextStateNormGroups[aliasKey];
    }

    if (selected.length > 0) {
      nextStateNormGroups[canonicalKey] = selected.map((norm) => ({
        jurabk: norm.jurabk,
        paragraphNr: norm.paragraphNr,
        absatz: norm.absatz,
        satz: norm.satz,
        nummer: norm.nummer,
      }));
    } else {
      delete nextStateNormGroups[canonicalKey];
    }
  }

  nextTopicStateGroups[topicName] = [privateGroupName];
  removeUnreferencedLegacyGroups(
    nextStateNormGroups,
    nextTopicStateGroups,
    previousAssigned,
  );

  return {
    stateNormGroups: nextStateNormGroups,
    topicStateGroups: nextTopicStateGroups,
  };
};

/**
 * Moves topic-owned private state keys when a topic is renamed.
 *
 * @param document Current persistence maps.
 * @param fromName Previous topic name.
 * @param toName Next topic name.
 * @returns Persistence maps with topic-owned keys renamed.
 */
export const renameTopicStatePersistence = (
  document: Pick<
    GesetzesgrundlageDocument,
    'stateNormGroups' | 'topicStateGroups'
  >,
  fromName: string,
  toName: string,
): Pick<GesetzesgrundlageDocument, 'stateNormGroups' | 'topicStateGroups'> => {
  if (fromName === toName) {
    return {
      stateNormGroups: document.stateNormGroups,
      topicStateGroups: document.topicStateGroups,
    };
  }

  const oldPrivateName = encodePrivateTopicGroupName(fromName);
  const newPrivateName = encodePrivateTopicGroupName(toName);
  const nextTopicStateGroups = { ...document.topicStateGroups };
  const assigned = nextTopicStateGroups[fromName];
  if (assigned !== undefined) {
    delete nextTopicStateGroups[fromName];
    nextTopicStateGroups[toName] = assigned.map((groupName) =>
      groupName === oldPrivateName ? newPrivateName : groupName,
    );
  }

  const nextStateNormGroups = { ...document.stateNormGroups };
  const oldPrivateStillReferenced =
    referencedGroupNames(nextTopicStateGroups).has(oldPrivateName);
  for (const key of Object.keys(document.stateNormGroups)) {
    const parsed = parseStateNormGroupKey(key);
    if (parsed?.groupName !== oldPrivateName) {
      continue;
    }
    nextStateNormGroups[
      `${newPrivateName}${STATE_NORM_GROUP_KEY_SEPARATOR}${parsed.state}`
    ] = nextStateNormGroups[key] ?? [];
    if (!oldPrivateStillReferenced) {
      delete nextStateNormGroups[key];
    }
  }

  return {
    stateNormGroups: nextStateNormGroups,
    topicStateGroups: nextTopicStateGroups,
  };
};

export const removeTopicStatePersistence = (
  document: Pick<
    GesetzesgrundlageDocument,
    'stateNormGroups' | 'topicStateGroups'
  >,
  topicName: string,
): Pick<GesetzesgrundlageDocument, 'stateNormGroups' | 'topicStateGroups'> => {
  const nextTopicStateGroups = { ...document.topicStateGroups };
  delete nextTopicStateGroups[topicName];

  const nextStateNormGroups = { ...document.stateNormGroups };
  const privateGroupName = encodePrivateTopicGroupName(topicName);
  const privateGroupStillReferenced =
    referencedGroupNames(nextTopicStateGroups).has(privateGroupName);
  if (!privateGroupStillReferenced) {
    removeGroupKeys(nextStateNormGroups, privateGroupName);
  }

  return {
    stateNormGroups: nextStateNormGroups,
    topicStateGroups: nextTopicStateGroups,
  };
};
