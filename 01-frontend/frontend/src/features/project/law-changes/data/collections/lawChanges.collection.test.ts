import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetailedLawChangeApiResponse } from '../lawChanges.types';

const mocks = vi.hoisted(() => ({
  createCollection: vi.fn((options: object) => ({ ...options, utils: {} })),
  getPending: vi.fn(),
  invalidateQueries: vi.fn(),
}));

vi.mock('@/api-clients/law-changes-module', () => ({
  getPendingPendingUpdatesGet: (...args: unknown[]) =>
    mocks.getPending(...args),
}));

vi.mock('@/integrations/tanstack-query/root-provider', () => ({
  queryClient: {
    invalidateQueries: (...args: unknown[]) => mocks.invalidateQueries(...args),
  },
}));

vi.mock('@tanstack/query-db-collection', () => ({
  queryCollectionOptions: (options: object) => options,
}));

vi.mock('@tanstack/react-db', () => ({
  createCollection: (options: object) => mocks.createCollection(options),
}));

const detailedResponse: DetailedLawChangeApiResponse[] = [
  {
    jurabk: 'BNatSchG',
    valid_from: '2026-05-23',
    affected_norms: [
      {
        paragraph_nr: '45',
        current_text: 'alt',
        change_text: 'neu',
        new_text: 'neu',
        transitional_note: '',
      },
    ],
  },
];

type CollectionOptions = {
  queryFn: () => Promise<unknown>;
  retry?: unknown;
  retryDelay?: unknown;
};

const getCollectionOptions = async (): Promise<CollectionOptions> => {
  await import('./lawChanges.collection');
  const call = mocks.createCollection.mock.calls[0]?.[0];
  return call as CollectionOptions;
};

describe('lawChangesCollection availability handling', () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createCollection.mockClear();
    mocks.getPending.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.resetModules();
  });

  it('flags the law-changes service as unavailable on a 503 outage', async () => {
    const { useLawChangesServiceUnavailable } =
      await import('./lawChanges.collection');
    const options = await getCollectionOptions();
    const availability = renderHook(useLawChangesServiceUnavailable);

    mocks.getPending.mockResolvedValue({
      data: undefined,
      response: { status: 503 },
    });

    await expect(act(options.queryFn)).rejects.toBeTruthy();
    expect(availability.result.current).toBe(true);
  });

  it('clears the unavailable flag after a successful fetch', async () => {
    const { useLawChangesServiceUnavailable } =
      await import('./lawChanges.collection');
    const options = await getCollectionOptions();
    const availability = renderHook(useLawChangesServiceUnavailable);

    mocks.getPending.mockResolvedValueOnce({
      data: undefined,
      response: { status: 503 },
    });
    await expect(act(options.queryFn)).rejects.toBeTruthy();
    expect(availability.result.current).toBe(true);

    mocks.getPending.mockResolvedValueOnce({
      data: detailedResponse,
      response: { status: 200 },
    });
    await act(options.queryFn);
    expect(availability.result.current).toBe(false);
  });

  it('returns an empty collection when no pending law changes exist', async () => {
    const { useLawChangesServiceUnavailable } =
      await import('./lawChanges.collection');
    const options = await getCollectionOptions();
    const availability = renderHook(useLawChangesServiceUnavailable);

    mocks.getPending.mockResolvedValueOnce({
      data: undefined,
      response: { status: 503 },
    });
    await expect(act(options.queryFn)).rejects.toBeTruthy();
    expect(availability.result.current).toBe(true);

    mocks.getPending.mockResolvedValueOnce({
      data: undefined,
      response: { status: 404 },
    });

    const result = await act(options.queryFn);
    expect(result).toEqual([]);
    expect(availability.result.current).toBe(false);
  });

  it('bounds retries with a backoff delay so one outage does not hammer the backend', async () => {
    const options = await getCollectionOptions();

    expect(typeof options.retry).toBe('number');
    expect(options.retry as number).toBeLessThanOrEqual(2);
    expect(typeof options.retryDelay).toBe('function');

    const retryDelay = options.retryDelay as (attempt: number) => number;
    expect(retryDelay(1)).toBeGreaterThan(retryDelay(0));
  });
});
