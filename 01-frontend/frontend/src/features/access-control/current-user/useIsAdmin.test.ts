import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useIsAdmin } from './useIsAdmin';

const { useCurrentUserMock } = vi.hoisted(() => ({
  useCurrentUserMock: vi.fn(),
}));

vi.mock('@/features/access-control/current-user/CurrentUserProvider', () => ({
  useCurrentUser: useCurrentUserMock,
}));

describe('useIsAdmin', () => {
  beforeEach(() => {
    useCurrentUserMock.mockReset();
  });

  it('returns true for admins', () => {
    useCurrentUserMock.mockReturnValue({ role: 'admin' });

    const { result } = renderHook(useIsAdmin);

    expect(result.current).toBe(true);
  });

  it('returns false for regular users', () => {
    useCurrentUserMock.mockReturnValue({ role: 'user' });

    const { result } = renderHook(useIsAdmin);

    expect(result.current).toBe(false);
  });
});
