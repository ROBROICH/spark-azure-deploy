import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { attachHttpStatusToError } from '@/integrations/api-clients/httpErrorStatus';

import beschlussFixture from '../data/catalog-mock/fixtures/beschluss.json';
import dokumenteFixture from '../data/catalog-mock/fixtures/dokumente.json';
import gesetzesgrundlageFixture from '../data/catalog-mock/fixtures/gesetzesgrundlage.json';
import projekttypFixture from '../data/catalog-mock/fixtures/projekttyp.json';
import type {
  BeschlussDocument,
  DokumenteDocument,
  GesetzesgrundlageDocument,
  ProjekttypDocument,
  Usecase,
} from '../data/usecaseApi';
import { catalogUsecaseQueryKey } from './usecaseQueries';
import { useSaveUsecase } from './useSaveUsecase';

const mocks = vi.hoisted(() => ({
  updateCatalogUsecase: vi.fn(),
  showMutationErrorToast: vi.fn((_options?: unknown) => true),
}));

vi.mock('@/api-clients/backend/sdk.gen', () => ({}));

vi.mock('../data/usecaseApi', () => ({
  updateCatalogUsecase: (...args: unknown[]) =>
    mocks.updateCatalogUsecase(...args),
}));

vi.mock('@/integrations/api-clients/mutationErrorToast', () => ({
  showMutationErrorToast: (options: unknown) =>
    mocks.showMutationErrorToast(options),
  isMutationToastHandledError: () => false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const usecase: Usecase = {
  slug: 'fernstrasse',
  projekttyp: projekttypFixture as ProjekttypDocument,
  gesetzesgrundlage: gesetzesgrundlageFixture as GesetzesgrundlageDocument,
  dokumente: dokumenteFixture as DokumenteDocument,
  beschluss: beschlussFixture as BeschlussDocument,
  updatedAt: '2026-08-20T10:00:00.000Z',
};

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(catalogUsecaseQueryKey(usecase.projekttyp.id), {
    kind: 'ready',
    usecase,
  });
  const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = (props: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, props.children);

  return { wrapper, invalidateSpy, queryClient };
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mocks.updateCatalogUsecase.mockReset();
  mocks.showMutationErrorToast.mockReset();
});

describe('useSaveUsecase', () => {
  it('PUTs all four documents with only gesetzesgrundlage changed and invalidates', async () => {
    const patched: GesetzesgrundlageDocument = {
      ...usecase.gesetzesgrundlage,
      topics: usecase.gesetzesgrundlage.topics.slice(0, 1),
    };
    const authoritativeUsecase: Usecase = {
      ...usecase,
      gesetzesgrundlage: patched,
      dokumente: { categories: [] },
      updatedAt: '2026-08-20T10:01:00.000Z',
    };
    mocks.updateCatalogUsecase.mockResolvedValue({
      data: authoritativeUsecase,
    });
    const { wrapper, invalidateSpy, queryClient } = createWrapper();
    const { result } = renderHook(() => useSaveUsecase(usecase.projekttyp.id), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({
        snapshot: usecase,
        patch: { gesetzesgrundlage: patched },
      });
    });

    expect(mocks.updateCatalogUsecase).toHaveBeenCalledWith(
      usecase.projekttyp.id,
      {
        slug: 'fernstrasse',
        projekttyp: usecase.projekttyp,
        gesetzesgrundlage: patched,
        dokumente: usecase.dokumente,
        beschluss: usecase.beschluss,
        updatedAt: usecase.updatedAt,
      },
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: catalogUsecaseQueryKey(usecase.projekttyp.id),
    });
    expect(
      queryClient.getQueryData(catalogUsecaseQueryKey(usecase.projekttyp.id)),
    ).toEqual({
      kind: 'ready',
      usecase: authoritativeUsecase,
    });
    expect(mocks.showMutationErrorToast).not.toHaveBeenCalled();
  });

  it('toasts on error, keeps the mutation error, and does not invalidate', async () => {
    const failure = new Error('save failed');
    mocks.updateCatalogUsecase.mockRejectedValue(failure);
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useSaveUsecase(usecase.projekttyp.id), {
      wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          snapshot: usecase,
          patch: { gesetzesgrundlage: usecase.gesetzesgrundlage },
        }),
      ).rejects.toThrow('save failed');
    });

    expect(mocks.showMutationErrorToast).toHaveBeenCalledWith({
      error: failure,
      fallbackMessage: 'catalog.toasts.saveError',
      statusMessages: {
        409: 'catalog.toasts.saveConflict',
        422: 'save failed',
      },
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.error).toBe(failure);
    });
  });

  it('fails closed without caching or invalidating when the PUT response is missing', async () => {
    mocks.updateCatalogUsecase.mockResolvedValue({ data: undefined });
    const { wrapper, invalidateSpy, queryClient } = createWrapper();
    const { result } = renderHook(() => useSaveUsecase(usecase.projekttyp.id), {
      wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          snapshot: usecase,
          patch: { gesetzesgrundlage: usecase.gesetzesgrundlage },
        }),
      ).rejects.toThrow('Catalog usecase response is invalid');
    });

    expect(
      queryClient.getQueryData(catalogUsecaseQueryKey(usecase.projekttyp.id)),
    ).toEqual({
      kind: 'ready',
      usecase,
    });
    expect(invalidateSpy).not.toHaveBeenCalled();
    expect(mocks.showMutationErrorToast).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackMessage: 'catalog.toasts.saveError',
      }),
    );
  });

  it('builds the PUT from the draft snapshot, not from a newer cached revision', async () => {
    const newerDokumente: DokumenteDocument = {
      categories: [
        {
          id: 'new-category',
          category: 'New server category',
          document_types: [],
        },
      ],
    };
    const patchedBeschluss: BeschlussDocument = {
      nodes: usecase.beschluss.nodes.slice(0, 1),
    };
    mocks.updateCatalogUsecase.mockResolvedValue({
      data: {
        ...usecase,
        dokumente: { categories: [] },
        beschluss: patchedBeschluss,
        updatedAt: '2026-08-20T10:01:00.000Z',
      },
    });
    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useSaveUsecase(usecase.projekttyp.id), {
      wrapper,
    });
    queryClient.setQueryData(catalogUsecaseQueryKey(usecase.projekttyp.id), {
      kind: 'ready',
      usecase: {
        ...usecase,
        dokumente: newerDokumente,
        updatedAt: '2026-08-20T10:00:30.000Z',
      },
    });

    await act(async () => {
      await result.current.mutateAsync({
        snapshot: usecase,
        patch: { beschluss: patchedBeschluss },
      });
    });

    expect(mocks.updateCatalogUsecase).toHaveBeenCalledWith(
      usecase.projekttyp.id,
      {
        slug: usecase.slug,
        projekttyp: usecase.projekttyp,
        gesetzesgrundlage: usecase.gesetzesgrundlage,
        dokumente: usecase.dokumente,
        beschluss: patchedBeschluss,
        updatedAt: usecase.updatedAt,
      },
    );
  });

  it('reloads the usecase and reports a conflict after a stale save', async () => {
    const conflict = attachHttpStatusToError(
      new Error('Catalog usecase was modified by another request'),
      new Response(null, { status: 409 }),
    );
    mocks.updateCatalogUsecase.mockRejectedValue(conflict);
    const { wrapper, invalidateSpy } = createWrapper();
    const { result } = renderHook(() => useSaveUsecase(usecase.projekttyp.id), {
      wrapper,
    });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          snapshot: usecase,
          patch: { gesetzesgrundlage: usecase.gesetzesgrundlage },
        }),
      ).rejects.toBe(conflict);
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: catalogUsecaseQueryKey(usecase.projekttyp.id),
    });
    expect(mocks.showMutationErrorToast).toHaveBeenCalledWith({
      error: conflict,
      fallbackMessage: 'catalog.toasts.saveError',
      statusMessages: {
        409: 'catalog.toasts.saveConflict',
        422: 'Catalog usecase was modified by another request',
      },
    });
  });
});
