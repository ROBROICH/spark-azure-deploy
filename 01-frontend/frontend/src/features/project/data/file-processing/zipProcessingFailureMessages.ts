import type { ZipFileResponse } from '@/api-clients/backend';
import type { WorkflowFailureCode } from '@/features/workflow-runtime/workflow-status/workflowStatus.types';

export type ZipWorkflowFailureCode = NonNullable<
  ZipFileResponse['workflowFailureCode']
>;

/**
 * The one code-to-wording mapping for workflow failure codes. Every surface
 * resolves a code to the same sentence. ZIP runs report `PROCESSING_*` and AI
 * analysis runs report `ANALYSIS_*`, because their next actions differ.
 */
const ZIP_PROCESSING_FAILURE_MESSAGE_KEYS = {
  ZIP_INVALID: 'Documents.processingFailureReasons.ZIP_INVALID',
  ZIP_AMBIGUOUS: 'Documents.processingFailureReasons.ZIP_AMBIGUOUS',
  ZIP_ENCRYPTED: 'Documents.processingFailureReasons.ZIP_ENCRYPTED',
  ZIP_UNSUPPORTED_COMPRESSION:
    'Documents.processingFailureReasons.ZIP_UNSUPPORTED_COMPRESSION',
  ZIP_SPLIT: 'Documents.processingFailureReasons.ZIP_SPLIT',
  ZIP_NOT_FOUND: 'Documents.processingFailureReasons.ZIP_NOT_FOUND',
  NO_PROCESSABLE_FILES:
    'Documents.processingFailureReasons.NO_PROCESSABLE_FILES',
  UNSUPPORTED_FILETYPE:
    'Documents.processingFailureReasons.UNSUPPORTED_FILETYPE',
  INVALID_FILENAME: 'Documents.processingFailureReasons.INVALID_FILENAME',
  VIRUS_DETECTED: 'Documents.processingFailureReasons.VIRUS_DETECTED',
  PROCESSING_FAILED: 'Documents.processingFailureReasons.PROCESSING_FAILED',
  PROCESSING_CANCELED: 'Documents.processingFailureReasons.PROCESSING_CANCELED',
  PROCESSING_TIMED_OUT:
    'Documents.processingFailureReasons.PROCESSING_TIMED_OUT',
  ANALYSIS_FAILED: 'Documents.processingFailureReasons.ANALYSIS_FAILED',
  ANALYSIS_CANCELED: 'Documents.processingFailureReasons.ANALYSIS_CANCELED',
  ANALYSIS_TIMED_OUT: 'Documents.processingFailureReasons.ANALYSIS_TIMED_OUT',
  NO_DOCUMENTS: 'Documents.processingFailureReasons.NO_DOCUMENTS',
} as const satisfies Record<WorkflowFailureCode, string>;

/** Generic AI analysis wording for a code this mapping does not know; never raw text. */
export const GENERIC_ANALYSIS_FAILURE_MESSAGE_KEY =
  ZIP_PROCESSING_FAILURE_MESSAGE_KEYS.ANALYSIS_FAILED;

const isWorkflowFailureCode = (
  code: string | null | undefined,
): code is WorkflowFailureCode =>
  typeof code === 'string' &&
  Object.hasOwn(ZIP_PROCESSING_FAILURE_MESSAGE_KEYS, code);

export const zipProcessingFailureMessageKey = (
  code: string | null | undefined,
  fallbackKey: string,
): string =>
  isWorkflowFailureCode(code)
    ? ZIP_PROCESSING_FAILURE_MESSAGE_KEYS[code]
    : fallbackKey;
