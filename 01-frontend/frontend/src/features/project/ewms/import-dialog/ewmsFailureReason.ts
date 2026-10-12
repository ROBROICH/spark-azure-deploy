import type { EwmsFailedFileReviewResult } from './ewmsFileReviewResult';

export type FailureReason = {
  labelKey: string;
  tooltipKey?: string;
};

// Raw failure text can carry internal workflow names, so an unmapped code
// resolves to the generic label instead of being shown.
const UNKNOWN_FAILURE_REASON: FailureReason = {
  labelKey: 'fileReviewPage.failureReasons.unknown',
};

const FAILURE_REASON_LABEL_KEYS_BY_CODE: Partial<Record<string, string>> = {
  DUPLICATE_FILE: 'fileReviewPage.failureReasons.duplicate',
  DUPLICATE_FILE_DETECTED: 'fileReviewPage.failureReasons.duplicate',
  FILE_NOT_FOUND: 'fileReviewPage.failureReasons.fileNotFound',
  INVALID_FILENAME: 'fileReviewPage.failureReasons.invalidFilename',
  NO_PROCESSABLE_FILES: 'fileReviewPage.failureReasons.noProcessableFiles',
  RENAME_FAILED: 'fileReviewPage.failureReasons.renameFailed',
  UNSUPPORTED_FILETYPE: 'fileReviewPage.failureReasons.unsupportedFiletype',
  UPLOAD_FAILED: 'fileReviewPage.failureReasons.uploadFailed',
  VALIDATION_FAILED: 'fileReviewPage.failureReasons.validationFailed',
  VIRUS_DETECTED: 'fileReviewPage.failureReasons.virusDetected',
  ZIP_INVALID: 'fileReviewPage.failureReasons.zipInvalid',
  ZIP_NOT_FOUND: 'fileReviewPage.failureReasons.zipNotFound',
};

const FAILURE_REASON_TOOLTIP_KEYS_BY_CODE: Partial<Record<string, string>> = {
  INVALID_FILENAME: 'fileReviewPage.failureReasonTooltips.invalidFilename',
};

const getFailedReviewMessage = (file: EwmsFailedFileReviewResult) =>
  file.error_message ??
  file.errorMessage ??
  file.message ??
  file.error ??
  file.reason ??
  file.detail;

const getFailedReviewCode = (file: EwmsFailedFileReviewResult) =>
  file.error_code ??
  file.errorCode ??
  file.code ??
  getFailedReviewMessage(file);

const normalizeFailureCode = (value: string) =>
  value
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();

const getFailureReasonLabelKey = (code: string) => {
  const normalizedCode = normalizeFailureCode(code);

  if (normalizedCode.startsWith('DUPLICATE_FILE_DETECTED')) {
    return FAILURE_REASON_LABEL_KEYS_BY_CODE.DUPLICATE_FILE_DETECTED;
  }

  return FAILURE_REASON_LABEL_KEYS_BY_CODE[normalizedCode];
};

const getFailureReasonTooltipKey = (code: string) =>
  FAILURE_REASON_TOOLTIP_KEYS_BY_CODE[normalizeFailureCode(code)];

/**
 * Resolves backend failure codes and fallback messages to localized badge metadata.
 */
export const getFailureReason = (
  file: EwmsFailedFileReviewResult,
): FailureReason => {
  const code = getFailedReviewCode(file);
  const message = getFailedReviewMessage(file);

  if (!code) {
    return UNKNOWN_FAILURE_REASON;
  }

  const labelKey =
    getFailureReasonLabelKey(code) ??
    (message ? getFailureReasonLabelKey(message) : undefined);

  if (labelKey) {
    return {
      labelKey,
      tooltipKey:
        getFailureReasonTooltipKey(code) ??
        (message ? getFailureReasonTooltipKey(message) : undefined),
    };
  }

  return UNKNOWN_FAILURE_REASON;
};
