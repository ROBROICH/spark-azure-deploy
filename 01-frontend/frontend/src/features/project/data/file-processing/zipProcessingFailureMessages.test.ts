import { resources } from '@/i18n/resources';
import type { WorkflowFailureCode } from '@/features/workflow-runtime/workflow-status/workflowStatus.types';
import { describe, expect, it } from 'vitest';
import {
  GENERIC_ANALYSIS_FAILURE_MESSAGE_KEY,
  zipProcessingFailureMessageKey,
} from './zipProcessingFailureMessages';

// Every code the backend workflow failure catalog can send. The Record type
// fails the typecheck when a catalog code is missing here.
const BACKEND_WORKFLOW_FAILURE_CODES = Object.keys({
  ZIP_INVALID: true,
  ZIP_AMBIGUOUS: true,
  ZIP_ENCRYPTED: true,
  ZIP_UNSUPPORTED_COMPRESSION: true,
  ZIP_SPLIT: true,
  ZIP_NOT_FOUND: true,
  NO_PROCESSABLE_FILES: true,
  UNSUPPORTED_FILETYPE: true,
  INVALID_FILENAME: true,
  VIRUS_DETECTED: true,
  PROCESSING_FAILED: true,
  PROCESSING_CANCELED: true,
  PROCESSING_TIMED_OUT: true,
  ANALYSIS_FAILED: true,
  ANALYSIS_CANCELED: true,
  ANALYSIS_TIMED_OUT: true,
  NO_DOCUMENTS: true,
} satisfies Record<WorkflowFailureCode, true>);

const readLocaleValue = (resource: object, key: string): unknown =>
  key
    .split('.')
    .reduce<unknown>(
      (value, segment) =>
        typeof value === 'object' && value !== null
          ? (value as Record<string, unknown>)[segment]
          : undefined,
      resource,
    );

describe('zipProcessingFailureMessageKey', () => {
  it('resolves every backend failure code to wording in both languages', () => {
    for (const code of BACKEND_WORKFLOW_FAILURE_CODES) {
      const key = zipProcessingFailureMessageKey(code, 'unused.fallback');

      expect(key).not.toBe('unused.fallback');
      expect(typeof readLocaleValue(resources.de.Project, key)).toBe('string');
      expect(typeof readLocaleValue(resources.en.Project, key)).toBe('string');
    }
  });

  it('resolves an unknown code to the generic wording, not to the code', () => {
    expect(
      zipProcessingFailureMessageKey(
        'FVPWorkflow crashed',
        GENERIC_ANALYSIS_FAILURE_MESSAGE_KEY,
      ),
    ).toBe(GENERIC_ANALYSIS_FAILURE_MESSAGE_KEY);
    expect(
      zipProcessingFailureMessageKey(
        'toString',
        GENERIC_ANALYSIS_FAILURE_MESSAGE_KEY,
      ),
    ).toBe(GENERIC_ANALYSIS_FAILURE_MESSAGE_KEY);
  });
});
