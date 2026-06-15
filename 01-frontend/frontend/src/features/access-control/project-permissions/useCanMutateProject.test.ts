import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanMutateProject } from './useCanMutateProject';

const { useCurrentUserMock, useProjectMock } = vi.hoisted(() => ({
  useCurrentUserMock: vi.fn(),
  useProjectMock: vi.fn(),
}));

vi.mock('@/features/access-control/current-user/CurrentUserProvider', () => ({
  useCurrentUser: useCurrentUserMock,
}));

vi.mock('@/features/project/data/collections/projects.collection', () => ({
  useProject: useProjectMock,
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({
      verfahrenId: 'project-1',
    }),
  }),
}));

describe('useCanMutateProject', () => {
  beforeEach(() => {
    useCurrentUserMock.mockReset();
    useProjectMock.mockReset();
    useProjectMock.mockReturnValue({
      data: { id: 'project-1', owners: ['owner-id'], members: ['member-id'] },
    });
  });

  it('allows admins to mutate projects at owner level', () => {
    useCurrentUserMock.mockReturnValue({ role: 'admin', userId: 'user-id' });

    const { result } = renderHook(() =>
      useCanMutateProject({ requiredLevel: 'owner' }),
    );

    expect(result.current.canMutateProject).toBe(true);
    expect(useProjectMock).toHaveBeenCalledWith('project-1');
  });

  it('allows project owners to mutate projects at owner level', () => {
    useCurrentUserMock.mockReturnValue({ role: 'user', userId: 'owner-id' });

    const { result } = renderHook(() =>
      useCanMutateProject({ requiredLevel: 'owner' }),
    );

    expect(result.current.canMutateProject).toBe(true);
  });

  it('allows project members to mutate projects at user level', () => {
    useCurrentUserMock.mockReturnValue({ role: 'user', userId: 'member-id' });

    const { result } = renderHook(() =>
      useCanMutateProject({ requiredLevel: 'user' }),
    );

    expect(result.current.canMutateProject).toBe(true);
  });

  it('does not allow project members to mutate projects at owner level', () => {
    useCurrentUserMock.mockReturnValue({ role: 'user', userId: 'member-id' });

    const { result } = renderHook(() =>
      useCanMutateProject({ requiredLevel: 'owner' }),
    );

    expect(result.current.canMutateProject).toBe(false);
  });

  it('does not allow unassigned users to mutate projects at user level', () => {
    useCurrentUserMock.mockReturnValue({ role: 'user', userId: 'user-id' });

    const { result } = renderHook(() =>
      useCanMutateProject({ requiredLevel: 'user' }),
    );

    expect(result.current.canMutateProject).toBe(false);
  });

  it('fails closed for regular users while project data is missing', () => {
    useCurrentUserMock.mockReturnValue({ role: 'user', userId: 'owner-id' });
    useProjectMock.mockReturnValue({ data: undefined });

    const ownerLevel = renderHook(() =>
      useCanMutateProject({ requiredLevel: 'owner' }),
    );
    const userLevel = renderHook(() =>
      useCanMutateProject({ requiredLevel: 'user' }),
    );

    expect(ownerLevel.result.current.canMutateProject).toBe(false);
    expect(userLevel.result.current.canMutateProject).toBe(false);
  });

  it('allows admins at owner level while project data is missing', () => {
    useCurrentUserMock.mockReturnValue({ role: 'admin', userId: 'admin-id' });
    useProjectMock.mockReturnValue({ data: undefined });

    const { result } = renderHook(() =>
      useCanMutateProject({ requiredLevel: 'owner' }),
    );

    expect(result.current.canMutateProject).toBe(true);
  });

  it('fails closed for admins at user level while project data is missing', () => {
    useCurrentUserMock.mockReturnValue({ role: 'admin', userId: 'admin-id' });
    useProjectMock.mockReturnValue({ data: undefined });

    const { result } = renderHook(() =>
      useCanMutateProject({ requiredLevel: 'user' }),
    );

    expect(result.current.canMutateProject).toBe(false);
  });
});
