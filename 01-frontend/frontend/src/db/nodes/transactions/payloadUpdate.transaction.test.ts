import {
  isMutationToastHandledError,
  showMutationErrorToast,
} from '@/integrations/api-clients/mutationErrorToast';
import { createHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';
import * as Sentry from '@sentry/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handlePersistNodeChangesFailure } from './payloadUpdate.transaction';

vi.mock('@/integrations/api-clients/mutationErrorToast', () => {
  class TestMutationToastHandledError extends Error {
    constructor(message: string, cause: unknown) {
      super(message);
      this.name = 'MutationToastHandledError';
      Object.assign(this, { cause });
    }
  }

  return {
    createHandledMutationError: (message: string, cause: unknown) =>
      new TestMutationToastHandledError(message, cause),
    isMutationToastHandledError: (error: unknown) =>
      error instanceof TestMutationToastHandledError,
    showMutationErrorToast: vi.fn(() => true),
  };
});

vi.mock('@sentry/react', () => ({
  captureException: vi.fn(),
}));

vi.mock('i18next', () => ({
  default: {
    t: (key: string) => key,
  },
}));

afterEach(() => {
  vi.mocked(showMutationErrorToast).mockClear();
  vi.mocked(Sentry.captureException).mockClear();
});

describe('handlePersistNodeChangesFailure', () => {
  it('passes handled version conflicts through without generic update UI', () => {
    const handledError = createHandledProjectVersionConflictError();

    expect(() => handlePersistNodeChangesFailure(handledError)).toThrow(
      'Project version conflict',
    );
    expect(showMutationErrorToast).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('shows the generic update failure for unrelated write errors', () => {
    const error = new Error('network failed');

    expect(() => handlePersistNodeChangesFailure(error)).toThrow(
      'Failed to update examination node',
    );

    expect(showMutationErrorToast).toHaveBeenCalledWith({
      error,
      fallbackMessage: 'nodeAction.updateFailed',
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });

  it('shows the forbidden mutation failure for permission errors', () => {
    const error = new Error('forbidden');
    Object.defineProperty(error, 'status', { value: 403 });
    let thrownError: unknown;

    try {
      handlePersistNodeChangesFailure(error);
    } catch (caughtError) {
      thrownError = caughtError;
    }

    expect(thrownError).toBeInstanceOf(Error);
    expect((thrownError as Error).message).toBe(
      'Failed to update examination node',
    );
    expect(isMutationToastHandledError(thrownError)).toBe(true);
    expect((thrownError as { cause?: unknown }).cause).toBe(error);
    expect(showMutationErrorToast).toHaveBeenCalledWith({
      error,
      fallbackMessage: 'nodeAction.updateFailed',
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
  });
});
