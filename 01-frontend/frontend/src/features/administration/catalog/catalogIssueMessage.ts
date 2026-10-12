import type { CatalogDraftIssue } from './catalogDraftValidation';

export type CatalogTranslate = (
  key: string,
  options?: Record<string, string>,
) => string;

export const catalogTopicNameError = (
  issues: CatalogDraftIssue[],
  topicIndex: number,
  t: CatalogTranslate,
): string | null => {
  const issue = issues.find(
    (candidate) =>
      candidate.code === 'duplicateTopicName' &&
      candidate.topicIndex === topicIndex,
  );
  return issue ? catalogIssueMessage(t, issue) : null;
};

export const catalogSubtopicNameError = (
  issues: CatalogDraftIssue[],
  topicIndex: number,
  subtopicIndex: number,
  t: CatalogTranslate,
): string | null => {
  const issue = issues.find(
    (candidate) =>
      candidate.code === 'duplicateSubtopicName' &&
      candidate.topicIndex === topicIndex &&
      candidate.subtopicIndex === subtopicIndex,
  );
  return issue ? catalogIssueMessage(t, issue) : null;
};

/**
 * Maps a draft issue code onto Administration locale copy, including the
 * conflicting name or referenced Beschluss node titles.
 *
 * @param t Feature translator.
 * @param issue Draft validation or refusal issue.
 * @returns Localized message for a field error or alert.
 */
export function catalogIssueMessage(
  t: CatalogTranslate,
  issue: CatalogDraftIssue,
): string {
  switch (issue.code) {
    case 'duplicateTopicName':
      return t('catalog.errors.duplicateTopicName', { name: issue.name });
    case 'duplicateSubtopicName':
      return t('catalog.errors.duplicateSubtopicName', { name: issue.name });
    case 'missingJurabk':
    case 'missingStateNormJurabk':
      return t('catalog.errors.missingJurabk');
    case 'duplicateNorm':
    case 'duplicateStateNorm':
      return t('catalog.errors.duplicateNorm', {
        jurabk: issue.jurabk,
        paragraphNr: issue.paragraphNr ?? '',
      });
    case 'topicReferenced':
      return t('catalog.errors.topicReferenced', {
        name: issue.topicName,
        nodes: issue.nodeTitles.join(', '),
      });
    case 'emptyName':
      return t('catalog.form.nameRequired');
  }
}
