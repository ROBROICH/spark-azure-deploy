import {
  federalStateCodes,
  type FederalStateCode,
} from '@/features/project/data/project-details-form/federalStates';

import type { CatalogNorm } from '../data/usecaseApi';
import { normIdentityKey } from './catalogDraftValidation';
import {
  requireTopic,
  withDocument,
  type CatalogDraftState,
} from './catalogDraftModel';
import {
  materializeTopicStateSelection,
  readTopicStateNormsByState,
} from './topicStateNormAdapter';

const containsSameNorms = (
  current: ReadonlyArray<CatalogNorm>,
  selected: ReadonlyArray<CatalogNorm>,
): boolean => {
  const currentIds = new Set(current.map(normIdentityKey));
  const selectedIds = new Set(selected.map(normIdentityKey));
  return (
    currentIds.size === selectedIds.size &&
    [...currentIds].every((id) => selectedIds.has(id))
  );
};

export const setTopicStateNorms = (
  state: CatalogDraftState,
  topicIndex: number,
  selectedByState: Partial<Record<FederalStateCode, CatalogNorm[]>>,
): CatalogDraftState => {
  const topic = requireTopic(state.document.topics, topicIndex);
  const currentByState = readTopicStateNormsByState(state.document, topic.name);
  const unchanged = federalStateCodes.every((stateCode) =>
    containsSameNorms(
      currentByState[stateCode],
      selectedByState[stateCode] ?? [],
    ),
  );
  if (unchanged) {
    return state;
  }

  const persistence = materializeTopicStateSelection(
    state.document,
    topic.name,
    selectedByState,
  );

  return withDocument(state, {
    ...state.document,
    stateNormGroups: persistence.stateNormGroups,
    topicStateGroups: persistence.topicStateGroups,
  });
};
