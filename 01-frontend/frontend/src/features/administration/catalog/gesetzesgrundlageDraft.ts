import {
  createCatalogDraftState,
  type CatalogDraftAction,
  type CatalogDraftState,
} from './catalogDraftModel';
import { setFederalNorms } from './catalogNormDraft';
import { setTopicStateNorms } from './catalogStateNormDraft';
import {
  addSubtopic,
  addTopic,
  removeSubtopic,
  removeTopic,
  updateSubtopic,
  updateTopic,
} from './catalogTopicDraft';
import { buildReferencedTopicTitles } from './catalogDraftValidation';

export {
  createCatalogDraftState,
  createEmptyNorm,
  createEmptySubtopic,
  createEmptyTopic,
} from './catalogDraftModel';
export type {
  CatalogDraftAction,
  CatalogDraftState,
  CatalogTopicFieldsPatch,
} from './catalogDraftModel';

/**
 * Applies one immutable edit to the shared gesetzesgrundlage draft.
 *
 * @param state Current catalog draft.
 * @param action Requested catalog edit.
 * @returns The next draft state.
 */
export const catalogDraftReducer = (
  state: CatalogDraftState,
  action: CatalogDraftAction,
): CatalogDraftState => {
  switch (action.type) {
    case 'replace':
      return action.beschlussNodes
        ? createCatalogDraftState(action.document, action.beschlussNodes)
        : {
            ...createCatalogDraftState(action.document, []),
            referencedTopics: state.referencedTopics,
          };
    case 'refreshReferencedTopics':
      return {
        ...state,
        referencedTopics: buildReferencedTopicTitles(action.beschlussNodes),
      };
    case 'addTopic':
      return addTopic(state, action.name);
    case 'updateTopic':
      return updateTopic(state, action.topicIndex, action.patch);
    case 'removeTopic':
      return removeTopic(state, action.topicIndex);
    case 'addSubtopic':
      return addSubtopic(state, action.topicIndex, action.name);
    case 'updateSubtopic':
      return updateSubtopic(
        state,
        action.topicIndex,
        action.subtopicIndex,
        action.patch,
      );
    case 'removeSubtopic':
      return removeSubtopic(state, action.topicIndex, action.subtopicIndex);
    case 'setFederalNorms':
      return setFederalNorms(state, action.path, action.selected);
    case 'setTopicStateNorms':
      return setTopicStateNorms(
        state,
        action.topicIndex,
        action.selectedByState,
      );
    case 'clearRefusal':
      return { ...state, lastRefusal: null };
  }
};

export const isCatalogDraftDirty = (
  draft: CatalogDraftState['document'],
  server: CatalogDraftState['document'],
): boolean => JSON.stringify(draft) !== JSON.stringify(server);
