import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyOnPersistenceFailure } from './notifyOnPersistenceFailure';

const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: { error: toastError },
}));

const flushMicrotasks = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('notifyOnPersistenceFailure', () => {
  beforeEach(() => toastError.mockReset());

  it('does not toast when the transaction persists', async () => {
    notifyOnPersistenceFailure(
      { isPersisted: { promise: Promise.resolve() } },
      'failed',
    );

    await flushMicrotasks();

    expect(toastError).not.toHaveBeenCalled();
  });

  it('toasts the provided message when the transaction rejects', async () => {
    notifyOnPersistenceFailure(
      { isPersisted: { promise: Promise.reject(new Error('boom')) } },
      'Save failed',
    );

    await flushMicrotasks();

    expect(toastError).toHaveBeenCalledWith('Save failed');
  });
});
