import type {
  CatalogNorm,
  CatalogSubtopic,
  CatalogTopic,
  GesetzesgrundlageDocument,
} from '../data/usecaseApi';
import type { CatalogTopicPath } from './catalogDraftValidation';
import {
  replaceAt,
  requireSubtopic,
  requireTopic,
  withDocument,
  type CatalogDraftState,
} from './catalogDraftModel';
import { applyFederalNormSelection } from './federalNormSelection';

const readNormOwner = (
  document: GesetzesgrundlageDocument,
  path: CatalogTopicPath,
): CatalogTopic | CatalogSubtopic => {
  const topic = requireTopic(document.topics, path.topicIndex);
  if (path.subtopicIndex === undefined) {
    return topic;
  }

  return requireSubtopic(topic, path.subtopicIndex);
};

const writeNormOwner = (
  document: GesetzesgrundlageDocument,
  path: CatalogTopicPath,
  owner: CatalogTopic | CatalogSubtopic,
): GesetzesgrundlageDocument => {
  const topic = requireTopic(document.topics, path.topicIndex);
  if (path.subtopicIndex === undefined) {
    return {
      ...document,
      topics: replaceAt(
        document.topics,
        path.topicIndex,
        owner as CatalogTopic,
      ),
    };
  }

  return {
    ...document,
    topics: replaceAt(document.topics, path.topicIndex, {
      ...topic,
      subtopics: replaceAt(
        topic.subtopics,
        path.subtopicIndex,
        owner as CatalogSubtopic,
      ),
    }),
  };
};

export const setFederalNorms = (
  state: CatalogDraftState,
  path: CatalogTopicPath,
  selected: ReadonlyArray<CatalogNorm>,
): CatalogDraftState => {
  const owner = readNormOwner(state.document, path);
  const nextLists = applyFederalNormSelection(
    owner.pruefungsNorms,
    owner.verfahrensNorms,
    selected,
  );
  return withDocument(
    state,
    writeNormOwner(state.document, path, {
      ...owner,
      ...nextLists,
    }),
  );
};
