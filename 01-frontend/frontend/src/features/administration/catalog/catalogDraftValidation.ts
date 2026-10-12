import type {
  BeschlussNode,
  CatalogNorm,
  CatalogSubtopic,
  CatalogTopic,
  GesetzesgrundlageDocument,
} from '../data/usecaseApi';
import { normIdentityKey, normalizeNormText } from './catalogNormIdentity';

export {
  countUniqueNorms,
  dedupeNormsByIdentity,
  normIdentityKey,
  normalizeNormText,
} from './catalogNormIdentity';

export type CatalogNormListKind = 'pruefungsNorms' | 'verfahrensNorms';

export type CatalogTopicPath =
  | { topicIndex: number; subtopicIndex?: undefined }
  | { topicIndex: number; subtopicIndex: number };

export type CatalogDraftIssue =
  | { code: 'duplicateTopicName'; name: string; topicIndex: number }
  | {
      code: 'duplicateSubtopicName';
      name: string;
      topicIndex: number;
      subtopicIndex: number;
    }
  | {
      code: 'missingJurabk';
      path: CatalogTopicPath;
      list: CatalogNormListKind;
      normIndex: number;
    }
  | {
      code: 'duplicateNorm';
      path: CatalogTopicPath;
      list: CatalogNormListKind;
      normIndex: number;
      jurabk: string;
      paragraphNr: string | null;
    }
  | {
      code: 'missingStateNormJurabk';
      groupName: string;
      stateKey: string;
      normIndex: number;
    }
  | {
      code: 'duplicateStateNorm';
      groupName: string;
      stateKey: string;
      normIndex: number;
      jurabk: string;
      paragraphNr: string | null;
    }
  | {
      code: 'topicReferenced';
      topicName: string;
      nodeTitles: string[];
    }
  | { code: 'emptyName' };

const normalizeName = (value: string): string => value.trim();

export const isBlankName = (value: string): boolean =>
  normalizeName(value).length === 0;

export const namesConflict = (left: string, right: string): boolean =>
  normalizeName(left).localeCompare(normalizeName(right), 'de', {
    sensitivity: 'accent',
  }) === 0;

const duplicateNameIndex = (
  names: ReadonlyArray<string>,
  candidate: string,
  skipIndex: number,
): number =>
  names.findIndex(
    (name, index) => index !== skipIndex && namesConflict(name, candidate),
  );

export const findDuplicateTopicName = (
  topics: ReadonlyArray<CatalogTopic>,
  candidate: string,
  skipIndex: number,
): number =>
  duplicateNameIndex(
    topics.map((topic) => topic.name),
    candidate,
    skipIndex,
  );

export const findDuplicateSubtopicName = (
  subtopics: ReadonlyArray<CatalogSubtopic>,
  candidate: string,
  skipIndex: number,
): number =>
  duplicateNameIndex(
    subtopics.map((subtopic) => subtopic.name),
    candidate,
    skipIndex,
  );

const collectNormListIssues = (
  norms: ReadonlyArray<CatalogNorm>,
  onMissing: (normIndex: number) => CatalogDraftIssue,
  onDuplicate: (
    normIndex: number,
    jurabk: string,
    paragraphNr: string | null,
  ) => CatalogDraftIssue,
): CatalogDraftIssue[] => {
  const issues: CatalogDraftIssue[] = [];
  const seen = new Map<string, number>();

  norms.forEach((norm, normIndex) => {
    if (normalizeName(norm.jurabk).length === 0) {
      issues.push(onMissing(normIndex));
      return;
    }

    const identity = normIdentityKey(norm);
    const firstIndex = seen.get(identity);
    if (firstIndex !== undefined) {
      issues.push(
        onDuplicate(
          normIndex,
          normalizeName(norm.jurabk),
          normalizeNormText(norm.paragraphNr),
        ),
      );
      return;
    }

    seen.set(identity, normIndex);
  });

  return issues;
};

const collectTopicNormIssues = (
  topic: CatalogTopic,
  topicIndex: number,
  subtopicIndex: number | undefined,
): CatalogDraftIssue[] => {
  const path: CatalogTopicPath =
    subtopicIndex === undefined
      ? { topicIndex }
      : { topicIndex, subtopicIndex };

  return [
    ...collectNormListIssues(
      topic.pruefungsNorms,
      (normIndex) => ({
        code: 'missingJurabk',
        path,
        list: 'pruefungsNorms',
        normIndex,
      }),
      (normIndex, jurabk, paragraphNr) => ({
        code: 'duplicateNorm',
        path,
        list: 'pruefungsNorms',
        normIndex,
        jurabk,
        paragraphNr,
      }),
    ),
    ...collectNormListIssues(
      topic.verfahrensNorms,
      (normIndex) => ({
        code: 'missingJurabk',
        path,
        list: 'verfahrensNorms',
        normIndex,
      }),
      (normIndex, jurabk, paragraphNr) => ({
        code: 'duplicateNorm',
        path,
        list: 'verfahrensNorms',
        normIndex,
        jurabk,
        paragraphNr,
      }),
    ),
  ];
};

const collectStateNormIssues = (
  document: GesetzesgrundlageDocument,
): CatalogDraftIssue[] => {
  const issues: CatalogDraftIssue[] = [];

  for (const [stateKey, norms] of Object.entries(document.stateNormGroups)) {
    const separatorIndex = stateKey.lastIndexOf('|');
    const groupName =
      separatorIndex > 0 ? stateKey.slice(0, separatorIndex) : stateKey;

    issues.push(
      ...collectNormListIssues(
        norms,
        (normIndex) => ({
          code: 'missingStateNormJurabk',
          groupName,
          stateKey,
          normIndex,
        }),
        (normIndex, jurabk, paragraphNr) => ({
          code: 'duplicateStateNorm',
          groupName,
          stateKey,
          normIndex,
          jurabk,
          paragraphNr,
        }),
      ),
    );
  }

  return issues;
};

/**
 * Collects client-side catalog problems that must be fixed before Speichern:
 * duplicate names, missing Rechtsgrundlage, and duplicate norms.
 *
 * @param document The drafted gesetzesgrundlage document.
 * @returns Field-level issues derived from the current draft.
 */
export const collectCatalogIssues = (
  document: GesetzesgrundlageDocument,
): CatalogDraftIssue[] => {
  const issues: CatalogDraftIssue[] = [];

  document.topics.forEach((topic, topicIndex) => {
    if (isBlankName(topic.name)) {
      issues.push({ code: 'emptyName' });
    }

    if (findDuplicateTopicName(document.topics, topic.name, topicIndex) >= 0) {
      issues.push({
        code: 'duplicateTopicName',
        name: topic.name,
        topicIndex,
      });
    }

    issues.push(...collectTopicNormIssues(topic, topicIndex, undefined));

    topic.subtopics.forEach((subtopic, subtopicIndex) => {
      if (isBlankName(subtopic.name)) {
        issues.push({ code: 'emptyName' });
      }

      if (
        findDuplicateSubtopicName(
          topic.subtopics,
          subtopic.name,
          subtopicIndex,
        ) >= 0
      ) {
        issues.push({
          code: 'duplicateSubtopicName',
          name: subtopic.name,
          topicIndex,
          subtopicIndex,
        });
      }

      issues.push(
        ...collectTopicNormIssues(
          { ...subtopic, subtopics: [] },
          topicIndex,
          subtopicIndex,
        ),
      );
    });
  });

  issues.push(...collectStateNormIssues(document));
  return issues;
};

const catalogIssueKey = (issue: CatalogDraftIssue): string =>
  JSON.stringify(issue);

/**
 * Returns only draft problems that were not already present in the loaded
 * catalog. Existing catalogs can contain legacy validation issues; those must
 * not block independent edits such as assigning a state-norm group.
 */
export const collectNewCatalogIssues = (
  document: GesetzesgrundlageDocument,
  baseline: GesetzesgrundlageDocument,
): CatalogDraftIssue[] => {
  const baselineIssueKeys = new Set(
    collectCatalogIssues(baseline).map(catalogIssueKey),
  );

  return collectCatalogIssues(document).filter(
    (issue) => !baselineIssueKeys.has(catalogIssueKey(issue)),
  );
};

export const buildReferencedTopicTitles = (
  nodes: ReadonlyArray<BeschlussNode>,
): ReadonlyMap<string, string[]> => {
  const titlesByTopic = new Map<string, string[]>();

  for (const node of nodes) {
    if (node.topic === null || node.topic.trim().length === 0) {
      continue;
    }

    const existing = titlesByTopic.get(node.topic) ?? [];
    existing.push(node.title);
    titlesByTopic.set(node.topic, existing);
  }

  return titlesByTopic;
};

export const referencedNodeTitlesForTopic = (
  referencedTopics: ReadonlyMap<string, string[]>,
  topicName: string,
): string[] => referencedTopics.get(topicName) ?? [];
