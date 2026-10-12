import '@testing-library/jest-dom/vitest';
import { attachHttpStatusToError } from '@/integrations/api-clients/httpErrorStatus';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Usecase } from '../data/usecaseApi';
import { catalogUsecaseQueryKey } from '../catalog/usecaseQueries';
import { CatalogExportButton } from './CatalogExportButton';

const mocks = vi.hoisted(() => ({
  getCatalogUsecase: vi.fn(),
  createObjectUrl: vi.fn((_blob: Blob | MediaSource) => 'blob:catalog-export'),
  revokeObjectUrl: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/api-clients/backend/sdk.gen', () => ({}));

vi.mock('../data/usecaseApi', () => ({
  getCatalogUsecase: (...args: unknown[]) => mocks.getCatalogUsecase(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mocks.toastError(...args),
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
  },
}));

const usecase: Usecase = {
  slug: 'fernstrasse',
  projekttyp: {
    id: '00000000-0000-0000-0000-000000000000',
    name: 'Fernstraße',
  },
  gesetzesgrundlage: {
    topics: [],
    stateNormGroups: {},
    topicStateGroups: {},
  },
  dokumente: {
    categories: [
      {
        id: '00000000-0000-0000-0000-000000000001',
        category: 'Teil A',
        document_types: [
          {
            id: '00000000-0000-0000-0000-000000000002',
            name: 'Lageplan',
            description: 'Plan',
            expected_count: 1,
          },
        ],
      },
    ],
  },
  beschluss: {
    nodes: [
      {
        id: 'root',
        parent_vae_node_id: null,
        title: 'Root',
        text: '',
        topic: null,
        order: 0,
        is_hidden: false,
        can_add_child: true,
      },
    ],
  },
  updatedAt: '2026-08-20T10:00:00.000Z',
};

const renderExport = (seedReady = true) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  if (seedReady) {
    queryClient.setQueryData(catalogUsecaseQueryKey(usecase.projekttyp.id), {
      kind: 'ready',
      usecase,
    });
  }
  const wrapper = (props: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, props.children);

  return render(<CatalogExportButton projectTypeId={usecase.projekttyp.id} />, {
    wrapper,
  });
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  mocks.getCatalogUsecase.mockReset();
  mocks.createObjectUrl.mockClear();
  mocks.revokeObjectUrl.mockClear();
  mocks.toastError.mockClear();
  mocks.toastSuccess.mockClear();
  mocks.getCatalogUsecase.mockResolvedValue({ data: usecase });
  vi.spyOn(URL, 'createObjectURL').mockImplementation(mocks.createObjectUrl);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(mocks.revokeObjectUrl);
});

describe('CatalogExportButton', () => {
  it('disables export while the catalog query is pending', () => {
    mocks.getCatalogUsecase.mockReturnValue(new Promise(() => undefined));
    renderExport(false);

    expect(
      screen.getByRole('button', { name: 'export.button' }),
    ).toBeDisabled();
  });

  it('retries a failed query when export is clicked again', async () => {
    const user = userEvent.setup();
    mocks.getCatalogUsecase.mockRejectedValue(new Error('export down'));
    renderExport(false);

    const exportButton = screen.getByRole('button', {
      name: 'export.button',
    });
    await waitFor(() => {
      expect(exportButton).toBeEnabled();
    });
    await user.click(exportButton);

    await waitFor(() => {
      expect(mocks.getCatalogUsecase).toHaveBeenCalledTimes(2);
    });
    expect(mocks.toastError).toHaveBeenCalledWith('export down');
  });

  it('disables export for a missing catalog', async () => {
    mocks.getCatalogUsecase.mockRejectedValue(
      attachHttpStatusToError(
        { message: 'not found' },
        new Response(null, { status: 404 }),
      ),
    );
    renderExport(false);

    await waitFor(() => {
      expect(mocks.getCatalogUsecase).toHaveBeenCalledTimes(1);
    });
    expect(
      screen.getByRole('button', { name: 'export.button' }),
    ).toBeDisabled();
  });

  it('downloads YAML that contains the four documents and the project type filename', async () => {
    const user = userEvent.setup();
    let downloaded: HTMLAnchorElement | undefined;
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      const element = originalCreateElement(tagName);
      if (tagName === 'a') {
        const anchor = element as HTMLAnchorElement;
        anchor.click = () => {
          downloaded = anchor;
        };
      }
      return element;
    });

    renderExport();
    await user.click(screen.getByRole('button', { name: 'export.button' }));

    await waitFor(() => {
      expect(downloaded?.download).toBe('export.filename:Fernstraße');
    });

    const blobArg = mocks.createObjectUrl.mock.calls[0]?.[0];
    expect(blobArg).toBeInstanceOf(Blob);
    if (!(blobArg instanceof Blob)) {
      throw new Error('Expected a YAML Blob');
    }
    const blob = blobArg;
    const yaml = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(yaml).toContain('name: Fernstraße');
    expect(yaml).toContain('category: Teil A');
    expect(yaml).toContain('name: Lageplan');
    expect(yaml).toContain('title: Root');
    expect(yaml).toContain('topics: []');
    expect(mocks.revokeObjectUrl).toHaveBeenCalledWith('blob:catalog-export');
    expect(mocks.toastSuccess).toHaveBeenCalledWith('export.success');
  });
});
