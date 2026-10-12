import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectTypeMutations } from './useProjectTypeMutations';

const mocks = vi.hoisted(() => ({
  createProjectTypes: vi.fn(),
  deleteProjectTypes: vi.fn(),
  showMutationErrorToast: vi.fn((_options?: unknown) => true),
  updateProjectTypes: vi.fn(),
}));

vi.mock('@/api-clients/backend', () => ({
  v1ProjectLogicCreateProjectTypes: (...args: unknown[]) =>
    mocks.createProjectTypes(...args),
  v1ProjectLogicDeleteProjectTypes: (...args: unknown[]) =>
    mocks.deleteProjectTypes(...args),
  v1ProjectLogicUpdateProjectTypes: (...args: unknown[]) =>
    mocks.updateProjectTypes(...args),
}));

vi.mock('@/integrations/api-clients/mutationErrorToast', () => ({
  showMutationErrorToast: (options: unknown) =>
    mocks.showMutationErrorToast(options),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = (props: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, props.children);

  return { wrapper, invalidateSpy };
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mocks.createProjectTypes.mockReset();
  mocks.deleteProjectTypes.mockReset();
  mocks.showMutationErrorToast.mockReset();
  mocks.updateProjectTypes.mockReset();
});

describe('useProjectTypeMutations', () => {
  it('creates a project type with a single-element payload and invalidates on success', async () => {
    mocks.createProjectTypes.mockResolvedValue({
      data: [{ id: 't-new', name: 'Windpark', active: true }],
    });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useProjectTypeMutations(), { wrapper });

    await act(async () => {
      await result.current.createProjectType.mutateAsync('Windpark');
    });

    expect(mocks.createProjectTypes).toHaveBeenCalledWith({
      body: [{ name: 'Windpark' }],
      throwOnError: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['project-types'],
    });
    expect(mocks.showMutationErrorToast).not.toHaveBeenCalled();
  });

  it('toasts create errors and does not invalidate the collection', async () => {
    const failure = new Error('boom');
    mocks.createProjectTypes.mockRejectedValue(failure);
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useProjectTypeMutations(), { wrapper });

    await act(async () => {
      await expect(
        result.current.createProjectType.mutateAsync('Windpark'),
      ).rejects.toThrow('boom');
    });

    expect(mocks.showMutationErrorToast).toHaveBeenCalledWith({
      error: failure,
      fallbackMessage: 'projectTypes.toasts.createError',
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('renames a project type with a single-element payload', async () => {
    mocks.updateProjectTypes.mockResolvedValue({
      data: [{ id: 't1', name: 'Solarpark', active: true }],
    });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useProjectTypeMutations(), { wrapper });

    await act(async () => {
      await result.current.renameProjectType.mutateAsync({
        id: 't1',
        name: 'Solarpark',
        active: true,
      });
    });

    expect(mocks.updateProjectTypes).toHaveBeenCalledWith({
      body: [{ id: 't1', name: 'Solarpark', active: true }],
      throwOnError: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['project-types'],
    });
  });

  it('sets a project type inactive with a single-element payload', async () => {
    mocks.updateProjectTypes.mockResolvedValue({
      data: [{ id: 't1', name: 'Windpark', active: false }],
    });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useProjectTypeMutations(), { wrapper });

    await act(async () => {
      await result.current.setProjectTypeActive.mutateAsync({
        id: 't1',
        name: 'Windpark',
        active: false,
      });
    });

    expect(mocks.updateProjectTypes).toHaveBeenCalledWith({
      body: [{ id: 't1', name: 'Windpark', active: false }],
      throwOnError: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['project-types'],
    });
  });

  it('toasts update errors and does not invalidate the collection', async () => {
    const failure = new Error('update failed');
    mocks.updateProjectTypes.mockRejectedValue(failure);
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useProjectTypeMutations(), { wrapper });

    await act(async () => {
      await expect(
        result.current.renameProjectType.mutateAsync({
          id: 't1',
          name: 'Solarpark',
          active: true,
        }),
      ).rejects.toThrow('update failed');
    });

    expect(mocks.showMutationErrorToast).toHaveBeenCalledWith({
      error: failure,
      fallbackMessage: 'projectTypes.toasts.updateError',
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('deletes a project type with a single-element ids query and invalidates on success', async () => {
    mocks.deleteProjectTypes.mockResolvedValue({ data: undefined });
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useProjectTypeMutations(), { wrapper });

    await act(async () => {
      await result.current.deleteProjectType.mutateAsync('t1');
    });

    expect(mocks.deleteProjectTypes).toHaveBeenCalledWith({
      query: { ids: ['t1'] },
      throwOnError: true,
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['project-types'],
    });
  });

  it('toasts delete errors and does not invalidate the collection', async () => {
    const failure = new Error('delete failed');
    mocks.deleteProjectTypes.mockRejectedValue(failure);
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useProjectTypeMutations(), { wrapper });

    await act(async () => {
      await expect(
        result.current.deleteProjectType.mutateAsync('t1'),
      ).rejects.toThrow('delete failed');
    });

    expect(mocks.showMutationErrorToast).toHaveBeenCalledWith({
      error: failure,
      fallbackMessage: 'projectTypes.toasts.deleteError',
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
