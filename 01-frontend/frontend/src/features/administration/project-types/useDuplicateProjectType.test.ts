import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PartialProjectTypeCloneError } from './duplicateProjectType.errors';
import { useDuplicateProjectType } from './useDuplicateProjectType';

const mocks = vi.hoisted(() => ({
  duplicateProjectType: vi.fn(),
  showMutationErrorToast: vi.fn((_options?: unknown) => true),
}));

vi.mock('./duplicateProjectType', () => ({
  duplicateProjectType: (...args: unknown[]) =>
    mocks.duplicateProjectType(...args),
}));

vi.mock('@/integrations/api-clients/mutationErrorToast', () => ({
  showMutationErrorToast: (options: unknown) =>
    mocks.showMutationErrorToast(options),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
}));

const created = {
  id: 'new-type',
  name: 'Fernstraße Kopie',
  active: true,
};

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
  mocks.duplicateProjectType.mockReset();
  mocks.showMutationErrorToast.mockReset();
});

describe('useDuplicateProjectType', () => {
  it('invalidates project types and the new catalog after a complete duplicate', async () => {
    mocks.duplicateProjectType.mockResolvedValue(created);
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useDuplicateProjectType(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        source: { id: 'source-type', name: 'Fernstraße', active: true },
        name: 'Fernstraße Kopie',
      });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['project-types'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['catalog-usecase', 'new-type'],
    });
    expect(mocks.showMutationErrorToast).not.toHaveBeenCalled();
  });

  it('toasts a partial clone without treating it as success', async () => {
    const failure = new PartialProjectTypeCloneError({
      projectTypeId: 'new-type',
      projectTypeName: 'Fernstraße Kopie',
    });
    mocks.duplicateProjectType.mockRejectedValue(failure);
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useDuplicateProjectType(), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          source: { id: 'source-type', name: 'Fernstraße', active: true },
          name: 'Fernstraße Kopie',
        }),
      ).rejects.toBe(failure);
    });

    expect(mocks.showMutationErrorToast).toHaveBeenCalledWith({
      error: failure,
      fallbackMessage:
        'projectTypes.toasts.duplicateRollbackFailed:Fernstraße Kopie',
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['project-types'],
    });
  });
});
