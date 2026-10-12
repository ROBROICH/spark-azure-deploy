import type { FederalStateCode } from '@/features/project/data/project-details-form/federalStates';
import { invariant } from 'es-toolkit/util';

import type {
  BeschlussNode,
  CatalogNorm,
  CatalogSubtopic,
  CatalogTopic,
  GesetzesgrundlageDocument,
} from '../data/usecaseApi';
import {
  buildReferencedTopicTitles,
  type CatalogDraftIssue,
  type CatalogTopicPath,
} from './catalogDraftValidation';

export type CatalogTopicFieldsPatch = {
  name?: string;
  description?: string;
  showInMvp?: boolean;
  showInEwm?: boolean;
  showInBeschluss?: boolean;
};

export type CatalogDraftState = {
  document: GesetzesgrundlageDocument;
  referencedTopics: ReadonlyMap<string, string[]>;
  lastRefusal: CatalogDraftIssue | null;
};

export type CatalogDraftAction =
  | {
      type: 'replace';
      document: GesetzesgrundlageDocument;
      beschlussNodes?: ReadonlyArray<BeschlussNode>;
    }
  | {
      type: 'refreshReferencedTopics';
      beschlussNodes: ReadonlyArray<BeschlussNode>;
    }
  | { type: 'addTopic'; name: string }
  | {
      type: 'updateTopic';
      topicIndex: number;
      patch: CatalogTopicFieldsPatch;
    }
  | { type: 'removeTopic'; topicIndex: number }
  | { type: 'addSubtopic'; topicIndex: number; name: string }
  | {
      type: 'updateSubtopic';
      topicIndex: number;
      subtopicIndex: number;
      patch: CatalogTopicFieldsPatch;
    }
  | { type: 'removeSubtopic'; topicIndex: number; subtopicIndex: number }
  | {
      type: 'setFederalNorms';
      path: CatalogTopicPath;
      selected: CatalogNorm[];
    }
  | {
      type: 'setTopicStateNorms';
      topicIndex: number;
      selectedByState: Partial<Record<FederalStateCode, CatalogNorm[]>>;
    }
  | { type: 'clearRefusal' };

export const createEmptyTopic = (name: string): CatalogTopic => ({
  name,
  description: '',
  showInMvp: false,
  showInEwm: false,
  showInBeschluss: false,
  pruefungsNorms: [],
  verfahrensNorms: [],
  subtopics: [],
});

export const createEmptySubtopic = (name: string): CatalogSubtopic => ({
  name,
  description: '',
  showInMvp: false,
  showInEwm: false,
  showInBeschluss: false,
  pruefungsNorms: [],
  verfahrensNorms: [],
});

export const createEmptyNorm = (): CatalogNorm => ({
  jurabk: '',
  paragraphNr: null,
  absatz: null,
  satz: null,
  nummer: null,
});

export const createCatalogDraftState = (
  document: GesetzesgrundlageDocument,
  beschlussNodes: ReadonlyArray<BeschlussNode>,
): CatalogDraftState => ({
  document: structuredClone(document),
  referencedTopics: buildReferencedTopicTitles(beschlussNodes),
  lastRefusal: null,
});

export const refuse = (
  state: CatalogDraftState,
  lastRefusal: CatalogDraftIssue,
): CatalogDraftState => ({ ...state, lastRefusal });

export const withDocument = (
  state: CatalogDraftState,
  document: GesetzesgrundlageDocument,
): CatalogDraftState => ({
  ...state,
  document,
  lastRefusal: null,
});

export const requireTopic = (
  topics: CatalogTopic[],
  topicIndex: number,
): CatalogTopic => {
  const topic = topics[topicIndex];
  invariant(topic !== undefined, 'Catalog topic index is out of range');
  return topic;
};

export const requireSubtopic = (
  topic: CatalogTopic,
  subtopicIndex: number,
): CatalogSubtopic => {
  const subtopic = topic.subtopics[subtopicIndex];
  invariant(subtopic !== undefined, 'Catalog subtopic index is out of range');
  return subtopic;
};

export const replaceAt = <T>(items: T[], index: number, item: T): T[] =>
  items.map((current, currentIndex) =>
    currentIndex === index ? item : current,
  );

export const applyTopicFields = (
  item: CatalogTopic | CatalogSubtopic,
  patch: CatalogTopicFieldsPatch,
): CatalogTopic | CatalogSubtopic => ({
  ...item,
  ...patch,
});
