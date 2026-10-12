import type { CatalogSubtopic, CatalogTopic } from '../data/usecaseApi';
import {
  findDuplicateSubtopicName,
  findDuplicateTopicName,
  isBlankName,
  referencedNodeTitlesForTopic,
} from './catalogDraftValidation';
import {
  applyTopicFields,
  createEmptySubtopic,
  createEmptyTopic,
  refuse,
  replaceAt,
  requireSubtopic,
  requireTopic,
  withDocument,
  type CatalogDraftState,
  type CatalogTopicFieldsPatch,
} from './catalogDraftModel';
import {
  removeTopicStatePersistence,
  renameTopicStatePersistence,
} from './topicStateNormAdapter';

export const addTopic = (
  state: CatalogDraftState,
  name: string,
): CatalogDraftState => {
  if (isBlankName(name)) {
    return refuse(state, { code: 'emptyName' });
  }

  if (findDuplicateTopicName(state.document.topics, name, -1) >= 0) {
    return refuse(state, {
      code: 'duplicateTopicName',
      name,
      topicIndex: -1,
    });
  }

  return withDocument(state, {
    ...state.document,
    topics: [...state.document.topics, createEmptyTopic(name.trim())],
  });
};

/**
 * Applies a topic patch while preserving unique names and state-group links.
 *
 * @param state Current catalog draft.
 * @param topicIndex Topic to update.
 * @param patch Fields to replace.
 * @returns The updated draft or a refusal for an invalid name.
 */
export const updateTopic = (
  state: CatalogDraftState,
  topicIndex: number,
  patch: CatalogTopicFieldsPatch,
): CatalogDraftState => {
  const topic = requireTopic(state.document.topics, topicIndex);

  if (patch.name !== undefined) {
    if (isBlankName(patch.name)) {
      return refuse(state, { code: 'emptyName' });
    }

    if (
      findDuplicateTopicName(state.document.topics, patch.name, topicIndex) >= 0
    ) {
      return refuse(state, {
        code: 'duplicateTopicName',
        name: patch.name,
        topicIndex,
      });
    }
  }

  const nextName = patch.name?.trim() ?? topic.name;
  const nextTopic = applyTopicFields(topic, {
    ...patch,
    name: nextName,
  }) as CatalogTopic;
  const persistence = renameTopicStatePersistence(
    state.document,
    topic.name,
    nextName,
  );

  return withDocument(state, {
    ...state.document,
    topics: replaceAt(state.document.topics, topicIndex, nextTopic),
    stateNormGroups: persistence.stateNormGroups,
    topicStateGroups: persistence.topicStateGroups,
  });
};

export const removeTopic = (
  state: CatalogDraftState,
  topicIndex: number,
): CatalogDraftState => {
  const topic = requireTopic(state.document.topics, topicIndex);
  const nodeTitles = referencedNodeTitlesForTopic(
    state.referencedTopics,
    topic.name,
  );

  if (nodeTitles.length > 0) {
    return refuse(state, {
      code: 'topicReferenced',
      topicName: topic.name,
      nodeTitles,
    });
  }

  const persistence = removeTopicStatePersistence(state.document, topic.name);

  return withDocument(state, {
    ...state.document,
    topics: state.document.topics.filter((_, index) => index !== topicIndex),
    stateNormGroups: persistence.stateNormGroups,
    topicStateGroups: persistence.topicStateGroups,
  });
};

export const addSubtopic = (
  state: CatalogDraftState,
  topicIndex: number,
  name: string,
): CatalogDraftState => {
  if (isBlankName(name)) {
    return refuse(state, { code: 'emptyName' });
  }

  const topic = requireTopic(state.document.topics, topicIndex);
  if (findDuplicateSubtopicName(topic.subtopics, name, -1) >= 0) {
    return refuse(state, {
      code: 'duplicateSubtopicName',
      name,
      topicIndex,
      subtopicIndex: -1,
    });
  }

  return withDocument(state, {
    ...state.document,
    topics: replaceAt(state.document.topics, topicIndex, {
      ...topic,
      subtopics: [...topic.subtopics, createEmptySubtopic(name.trim())],
    }),
  });
};

/**
 * Applies a subtopic patch while keeping names unique within its parent.
 *
 * @param state Current catalog draft.
 * @param topicIndex Parent topic index.
 * @param subtopicIndex Subtopic to update.
 * @param patch Fields to replace.
 * @returns The updated draft or a refusal for an invalid name.
 */
export const updateSubtopic = (
  state: CatalogDraftState,
  topicIndex: number,
  subtopicIndex: number,
  patch: CatalogTopicFieldsPatch,
): CatalogDraftState => {
  const topic = requireTopic(state.document.topics, topicIndex);
  const subtopic = requireSubtopic(topic, subtopicIndex);

  if (patch.name !== undefined) {
    if (isBlankName(patch.name)) {
      return refuse(state, { code: 'emptyName' });
    }

    if (
      findDuplicateSubtopicName(topic.subtopics, patch.name, subtopicIndex) >= 0
    ) {
      return refuse(state, {
        code: 'duplicateSubtopicName',
        name: patch.name,
        topicIndex,
        subtopicIndex,
      });
    }
  }

  const nextSubtopic = applyTopicFields(subtopic, {
    ...patch,
    name: patch.name?.trim() ?? subtopic.name,
  }) as CatalogSubtopic;

  return withDocument(state, {
    ...state.document,
    topics: replaceAt(state.document.topics, topicIndex, {
      ...topic,
      subtopics: replaceAt(topic.subtopics, subtopicIndex, nextSubtopic),
    }),
  });
};

export const removeSubtopic = (
  state: CatalogDraftState,
  topicIndex: number,
  subtopicIndex: number,
): CatalogDraftState => {
  const topic = requireTopic(state.document.topics, topicIndex);
  requireSubtopic(topic, subtopicIndex);

  return withDocument(state, {
    ...state.document,
    topics: replaceAt(state.document.topics, topicIndex, {
      ...topic,
      subtopics: topic.subtopics.filter((_, index) => index !== subtopicIndex),
    }),
  });
};
