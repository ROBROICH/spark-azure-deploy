import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFavorites } from './useFavorites';

const mocks = vi.hoisted(() => ({
  useCurrentUser: vi.fn(),
  observedKeys: [] as string[],
}));

vi.mock('@/features/access-control/current-user/CurrentUserProvider', () => ({
  useCurrentUser: () => mocks.useCurrentUser(),
}));

// Replace useLocalStorage with an in-memory store so the test can observe the
// derived storage key the hook scopes favorites under, independent of the
// jsdom/node localStorage backend.
vi.mock('@/features/shared/browser-storage/useLocalStorage', () => ({
  useLocalStorage: <T>(props: { key: string; initialValue: T }) => {
    mocks.observedKeys.push(props.key);
    // eslint-disable-next-line no-restricted-syntax -- test stub mirroring useLocalStorage's [value, setValue] tuple so toggle()/remove() drive re-renders.
    return useState<T>(props.initialValue);
  },
}));

const RAW_USER_ID = 'user-abc-123';

describe('useFavorites localStorage scoping', () => {
  beforeEach(() => {
    mocks.observedKeys.length = 0;
    mocks.useCurrentUser.mockReturnValue({ userId: RAW_USER_ID });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not scope favorites under a storage key containing the raw user id', () => {
    renderHook(() => useFavorites());

    expect(mocks.observedKeys.length).toBeGreaterThan(0);
    for (const key of mocks.observedKeys) {
      expect(key).not.toContain(RAW_USER_ID);
    }
  });

  it('uses distinct derived storage keys for different users', () => {
    renderHook(() => useFavorites());
    const firstUserKey = mocks.observedKeys.at(-1);

    mocks.observedKeys.length = 0;
    mocks.useCurrentUser.mockReturnValue({ userId: 'a-completely-other-user' });
    renderHook(() => useFavorites());
    const secondUserKey = mocks.observedKeys.at(-1);

    expect(firstUserKey).toBeDefined();
    expect(secondUserKey).toBeDefined();
    expect(firstUserKey).not.toEqual(secondUserKey);
  });

  it('still stores and reads favorite project ids for the feature to work', () => {
    const { result } = renderHook(() => useFavorites());

    act(() => {
      result.current.toggle('project-1');
    });

    expect(result.current.favoriteIds).toEqual(['project-1']);
    expect(result.current.isFavorite('project-1')).toBe(true);
  });
});
