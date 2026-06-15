import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanDeleteProject } from './useCanDeleteProject';

const { useCurrentUserMock } = vi.hoisted(() => ({
  useCurrentUserMock: vi.fn(),
}));

vi.mock('@/features/access-control/current-user/CurrentUserProvider', () => ({
  useCurrentUser: useCurrentUserMock,
}));

describe('useCanDeleteProject', () => {
  beforeEach(() => {
    useCurrentUserMock.mockReset();
  });

  it('allows admins to delete projects', () => {
    useCurrentUserMock.mockReturnValue({ role: 'admin' });

    const { result } = renderHook(useCanDeleteProject);

    expect(result.current.canDeleteProject).toBe(true);
  });

  it('does not allow regular users to delete projects', () => {
    useCurrentUserMock.mockReturnValue({ role: 'user' });

    const { result } = renderHook(useCanDeleteProject);

    expect(result.current.canDeleteProject).toBe(false);
  });
});
