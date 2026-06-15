import '@testing-library/jest-dom/vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RpbFeatureProvider, useRpbFeatureContext } from './RpbFeatureContext';

const createDeferred = () => {
  let resolve!: () => void;
  let reject!: () => void;
  const promise = new Promise<void>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, reject, resolve };
};

describe('RpbFeatureContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('keeps Beschluss commits pending for one second after persistence resolves', async () => {
    const deferred = createDeferred();

    const Probe = () => {
      const { isBeschlussCommitPending, trackBeschlussCommit } =
        useRpbFeatureContext();

      return (
        <div>
          <span>{isBeschlussCommitPending ? 'pending' : 'idle'}</span>
          <button
            type="button"
            onClick={() => trackBeschlussCommit(deferred.promise)}
          >
            track
          </button>
        </div>
      );
    };

    render(
      <RpbFeatureProvider>
        <Probe />
      </RpbFeatureProvider>,
    );

    expect(screen.getByText('idle')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'track' }));

    expect(screen.getByText('pending')).toBeInTheDocument();

    await act(async () => {
      deferred.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('pending')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(999);
    });

    expect(screen.getByText('pending')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  it('keeps Beschluss commits pending until overlapping commits have settled', async () => {
    const firstCommit = createDeferred();
    const secondCommit = createDeferred();

    const Probe = () => {
      const { isBeschlussCommitPending, trackBeschlussCommit } =
        useRpbFeatureContext();

      return (
        <div>
          <span>{isBeschlussCommitPending ? 'pending' : 'idle'}</span>
          <button
            type="button"
            onClick={() => {
              trackBeschlussCommit(firstCommit.promise);
              trackBeschlussCommit(secondCommit.promise);
            }}
          >
            track-both
          </button>
        </div>
      );
    };

    render(
      <RpbFeatureProvider>
        <Probe />
      </RpbFeatureProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'track-both' }));
    expect(screen.getByText('pending')).toBeInTheDocument();

    await act(async () => {
      firstCommit.resolve();
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByText('pending')).toBeInTheDocument();

    await act(async () => {
      secondCommit.resolve();
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByText('idle')).toBeInTheDocument();
  });

  it('releases rejected Beschluss commits after the same pending delay', async () => {
    const rejectedCommit = createDeferred();

    const Probe = () => {
      const { isBeschlussCommitPending, trackBeschlussCommit } =
        useRpbFeatureContext();

      return (
        <div>
          <span>{isBeschlussCommitPending ? 'pending' : 'idle'}</span>
          <button
            type="button"
            onClick={() => trackBeschlussCommit(rejectedCommit.promise)}
          >
            track-rejected
          </button>
        </div>
      );
    };

    render(
      <RpbFeatureProvider>
        <Probe />
      </RpbFeatureProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'track-rejected' }));
    expect(screen.getByText('pending')).toBeInTheDocument();

    await act(async () => {
      rejectedCommit.reject();
      await Promise.resolve();
    });
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(screen.getByText('pending')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText('idle')).toBeInTheDocument();
  });
});
