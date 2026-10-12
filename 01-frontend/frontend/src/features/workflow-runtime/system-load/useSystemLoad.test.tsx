import { renderHook } from '@testing-library/react';
import type * as TanstackReactQuery from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSystemLoad } from './useSystemLoad';

const mocks = vi.hoisted(() => ({
  generatedQueryOptions: {
    queryKey: ['temporal', 'system-load'],
    staleTime: 30_000,
  },
  loadPercentage: 0,
  useQuery: vi.fn(),
}));

vi.mock('@/api-clients/backend/@tanstack/react-query.gen', () => ({
  v1TemporalJobsGetTemporalSystemLoadOptions: () => mocks.generatedQueryOptions,
}));

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof TanstackReactQuery>();

  return {
    ...actual,
    useQuery: mocks.useQuery,
  };
});

describe('useSystemLoad', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE', '');
    window.__APP_CONFIG__ = undefined;
    mocks.useQuery.mockImplementation(() => ({
      data: { loadPercentage: mocks.loadPercentage },
      isError: false,
      isFetching: false,
      isLoading: false,
      refetch: vi.fn(),
    }));
  });

  afterEach(() => {
    window.__APP_CONFIG__ = undefined;
    vi.unstubAllEnvs();
    mocks.useQuery.mockClear();
  });

  it('allows starting workflows below the default system-load threshold', () => {
    mocks.loadPercentage = 499;

    const { result } = renderHook(() => useSystemLoad());

    expect(result.current.isSystemLoadHigh).toBe(false);
    expect(result.current.disableThresholdPercentage).toBe(500);
  });

  it('blocks starting workflows at the default system-load threshold', () => {
    mocks.loadPercentage = 500;

    const { result } = renderHook(() => useSystemLoad());

    expect(result.current.isSystemLoadHigh).toBe(true);
  });

  it('uses the runtime-configured system-load threshold', () => {
    window.__APP_CONFIG__ = {
      VITE_SYSTEM_LOAD_DISABLE_THRESHOLD_PERCENTAGE: '300',
    };
    mocks.loadPercentage = 300;

    const { result } = renderHook(() => useSystemLoad());

    expect(result.current.disableThresholdPercentage).toBe(300);
    expect(result.current.isSystemLoadHigh).toBe(true);
  });

  it('forwards generated query options with the default polling interval', () => {
    renderHook(() => useSystemLoad());

    expect(mocks.useQuery).toHaveBeenCalledWith({
      ...mocks.generatedQueryOptions,
      refetchInterval: 120_000,
    });
  });

  it('forwards an explicit polling opt-out for cache-only progress surfaces', () => {
    renderHook(() => useSystemLoad({ refetchInterval: false }));

    expect(mocks.useQuery).toHaveBeenCalledWith({
      ...mocks.generatedQueryOptions,
      refetchInterval: false,
    });
  });
});
