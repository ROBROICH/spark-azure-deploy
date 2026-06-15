import { toast } from '@/features/ui/toast/Toast';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachHttpStatusToError } from './httpErrorStatus';
import {
  createHandledMutationError,
  isMutationToastHandledError,
  MutationToastHandledError,
  showMutationErrorToast,
} from './mutationErrorToast';

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: {
    error: vi.fn(),
  },
}));

vi.mock('i18next', () => ({
  default: {
    t: (key: string) => key,
  },
}));

afterEach(() => {
  vi.mocked(toast.error).mockClear();
});

describe('mutationErrorToast', () => {
  it('shows the shared forbidden toast for 403 errors', () => {
    const error = attachHttpStatusToError(
      { detail: 'Forbidden' },
      new Response(null, { status: 403 }),
    );

    showMutationErrorToast({
      error,
      fallbackMessage: 'fallback',
    });

    expect(toast.error).toHaveBeenCalledWith('mutationError.forbidden');
  });

  it('shows a status-specific message before the fallback', () => {
    const error = attachHttpStatusToError(
      { detail: 'Bad request' },
      new Response(null, { status: 400 }),
    );

    showMutationErrorToast({
      error,
      fallbackMessage: 'fallback',
      statusMessages: {
        400: 'last owner',
      },
    });

    expect(toast.error).toHaveBeenCalledWith('last owner');
  });

  it('shows the fallback for unmatched errors', () => {
    const error = attachHttpStatusToError(
      { detail: 'Bad request' },
      new Response(null, { status: 400 }),
    );

    showMutationErrorToast({
      error,
      fallbackMessage: 'fallback',
    });

    expect(toast.error).toHaveBeenCalledWith('fallback');
  });

  it('does not toast errors that are wrapped as already handled', () => {
    const error = attachHttpStatusToError(
      { detail: 'Forbidden' },
      new Response(null, { status: 403 }),
    );

    showMutationErrorToast({
      error,
      fallbackMessage: 'fallback',
    });
    const wrappedError = createHandledMutationError('wrapped', error);
    showMutationErrorToast({
      error: wrappedError,
      fallbackMessage: 'fallback',
    });

    expect(toast.error).toHaveBeenCalledOnce();
    expect(wrappedError).toBeInstanceOf(MutationToastHandledError);
    expect(isMutationToastHandledError(wrappedError)).toBe(true);
  });
});
