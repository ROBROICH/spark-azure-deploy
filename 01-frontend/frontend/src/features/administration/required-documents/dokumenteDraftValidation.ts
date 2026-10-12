import type { DokumenteDocument } from '../data/usecaseApi';

export type DokumenteDraftIssue =
  | {
      code: 'duplicateDocumentTypeName';
      name: string;
      categoryIndex: number;
      typeIndex: number;
    }
  | {
      code: 'emptyDocumentTypeName';
      categoryIndex: number;
      typeIndex: number;
    }
  | {
      code: 'invalidExpectedCount';
      categoryIndex: number;
      typeIndex: number;
    }
  | { code: 'emptyCategoryName'; categoryIndex: number };

const normalizeName = (value: string): string => value.trim();

export const isBlankName = (value: string): boolean =>
  normalizeName(value).length === 0;

export const namesConflict = (left: string, right: string): boolean =>
  normalizeName(left).localeCompare(normalizeName(right), 'de', {
    sensitivity: 'accent',
  }) === 0;

export const findDuplicateDocumentTypeName = (
  names: ReadonlyArray<string>,
  candidate: string,
  skipIndex: number,
): number => {
  const trimmed = normalizeName(candidate);
  if (trimmed.length === 0) {
    return -1;
  }

  return names.findIndex(
    (name, index) => index !== skipIndex && namesConflict(name, trimmed),
  );
};

export const parseExpectedCountInput = (
  raw: string,
): number | null | 'invalid' => {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (!/^[1-9]\d*$/.test(trimmed)) {
    return 'invalid';
  }

  return Number(trimmed);
};

/**
 * Collects client-side save blockers for the dokumente draft: blank names,
 * duplicate type names in a category, and non-positive expected counts.
 *
 * @param document Current dokumente draft.
 * @returns Issues that disable Speichern until resolved.
 */
export const collectDokumenteIssues = (
  document: DokumenteDocument,
): DokumenteDraftIssue[] => {
  const issues: DokumenteDraftIssue[] = [];

  document.categories.forEach((category, categoryIndex) => {
    if (isBlankName(category.category)) {
      issues.push({ code: 'emptyCategoryName', categoryIndex });
    }

    const typeNames = category.document_types.map((type) => type.name);
    category.document_types.forEach((type, typeIndex) => {
      if (isBlankName(type.name)) {
        issues.push({
          code: 'emptyDocumentTypeName',
          categoryIndex,
          typeIndex,
        });
        return;
      }

      const duplicateIndex = findDuplicateDocumentTypeName(
        typeNames,
        type.name,
        typeIndex,
      );
      if (duplicateIndex >= 0) {
        issues.push({
          code: 'duplicateDocumentTypeName',
          name: type.name.trim(),
          categoryIndex,
          typeIndex,
        });
      }

      if (
        type.expected_count !== null &&
        (!Number.isInteger(type.expected_count) || type.expected_count < 1)
      ) {
        issues.push({
          code: 'invalidExpectedCount',
          categoryIndex,
          typeIndex,
        });
      }
    });
  });

  return issues;
};

type DokumenteTranslate = (
  key: string,
  options?: Record<string, string>,
) => string;

/**
 * Maps a dokumente draft issue onto Administration locale copy.
 *
 * @param t Feature translator.
 * @param issue Draft validation or refusal issue.
 * @returns Localized field or alert message.
 */
export const dokumenteIssueMessage = (
  t: DokumenteTranslate,
  issue: DokumenteDraftIssue,
): string => {
  switch (issue.code) {
    case 'duplicateDocumentTypeName':
      return t('requiredDocuments.errors.duplicateDocumentTypeName', {
        name: issue.name,
      });
    case 'emptyDocumentTypeName':
    case 'emptyCategoryName':
      return t('requiredDocuments.errors.emptyDocumentTypeName');
    case 'invalidExpectedCount':
      return t('requiredDocuments.errors.invalidExpectedCount');
  }
};
