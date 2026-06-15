import type * as ProjectVersioning from '@/features/project/versioning/projectVersioning';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ReadOnlyDocumentsCard } from './ReadOnlyDocumentsCard';

const mocks = vi.hoisted(() => ({
  openForProject: vi.fn(),
  useCanMutateProject: vi.fn(() => ({ canMutateProject: false })),
  useProjectFiles: vi.fn(),
  useProjectRouteVersion: vi.fn(() => 3),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: { version?: number }) => {
      if (key === 'Documents.updateDocuments.versionOption') {
        return `Version ${values?.version}`;
      }
      return key;
    },
  }),
}));

vi.mock('@/features/project/data/collections/projects.collection', () => ({
  useProject: () => ({
    data: {
      id: 'project-1',
      latestVersion: 3,
    },
  }),
}));

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: mocks.useCanMutateProject,
  }),
);

vi.mock(
  '@/features/project/data/file-processing/useProjectProcessingState',
  () => ({
    useProjectProcessingState: () => ({
      fileProcessingBannerDismissKey: 'dismiss-key',
      hasActiveFileProcessing: false,
      hasFailedFileProcessing: false,
    }),
  }),
);

vi.mock(
  '@/features/project/overview-screen/documents-update-dialog/DocumentsUploadContext',
  () => ({
    useDocumentsUploadContext: () => ({
      openForProject: mocks.openForProject,
    }),
  }),
);

vi.mock('@/features/project/data/project-files/useProjectFiles', () => ({
  useProjectFiles: (...args: unknown[]) => mocks.useProjectFiles(...args),
}));

vi.mock(
  '@/features/project/versioning/projectVersioning',
  async (importOriginal) => ({
    ...(await importOriginal<typeof ProjectVersioning>()),
    useProjectRouteVersion: mocks.useProjectRouteVersion,
  }),
);

vi.mock('@/features/ui/select-menu/SelectMenu', () => ({
  SelectMenu: (props: {
    items: { label: string; value: string }[];
    value: string;
    onChange: (value: string) => void;
  }) => (
    <div>
      {props.items.map((item) => (
        <button
          key={item.value}
          type="button"
          onClick={() => props.onChange(item.value)}
        >
          choose {item.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('./ReadOnlyDocumentsToolbar', () => ({
  ReadOnlyDocumentsToolbar: (props: { actions?: ReactNode }) => (
    <div>
      toolbar
      {props.actions}
    </div>
  ),
}));

vi.mock('./FileProcessingStatusAlert', () => ({
  FileProcessingStatusAlert: () => null,
}));

vi.mock('./ReadOnlyDocumentsTable', () => ({
  ReadOnlyDocumentsTable: () => <div>documents table</div>,
}));

vi.mock('./ReadOnlyPdfPreview', () => ({
  ReadOnlyPdfPreview: () => <div>preview</div>,
}));

async function renderWithRouter(initialEntry: string) {
  const rootRoute = createRootRoute({ component: Outlet });
  const overviewRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/verfahren/$verfahrenId/',
    validateSearch: z.object({
      documentVersion: z.number().int().positive().optional().catch(undefined),
      previewDocumentId: z.string().optional(),
    }),
    component: ReadOnlyDocumentsCard,
  });
  const routeTree = rootRoute.addChildren([overviewRoute]);
  const history = createMemoryHistory({
    initialEntries: [initialEntry],
  });
  const router = createRouter({ routeTree, history });

  render(<RouterProvider router={router} />);
  await router.load();

  return router;
}

describe('ReadOnlyDocumentsCard', () => {
  beforeEach(() => {
    window.__APP_CONFIG__ = undefined;
    mocks.openForProject.mockReset();
    mocks.useCanMutateProject.mockClear();
    mocks.useCanMutateProject.mockReturnValue({ canMutateProject: false });
    mocks.useProjectFiles.mockReset();
    mocks.useProjectRouteVersion.mockClear();
    mocks.useProjectFiles.mockReturnValue({
      files: [{ id: 'file-1' }],
      isError: false,
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('uses the selected document version and closes the preview when switching versions', async () => {
    const user = userEvent.setup();
    const router = await renderWithRouter(
      '/verfahren/project-1/?documentVersion=2&previewDocumentId=file-1',
    );

    await user.click(screen.getByRole('button', { name: 'choose Version 1' }));

    await waitFor(() => {
      expect(router.state.location.search).toMatchObject({
        documentVersion: 1,
      });
    });
    expect(router.state.location.search).not.toHaveProperty(
      'previewDocumentId',
    );
    expect(mocks.useProjectFiles).toHaveBeenCalledWith('project-1', {
      documentVersion: 2,
    });
    await waitFor(() =>
      expect(mocks.useProjectFiles).toHaveBeenCalledWith('project-1', {
        documentVersion: 1,
      }),
    );
  });

  it('clears the document version param when switching back to the latest version', async () => {
    const user = userEvent.setup();
    const router = await renderWithRouter(
      '/verfahren/project-1/?documentVersion=2&previewDocumentId=file-1',
    );

    await user.click(screen.getByRole('button', { name: 'choose Version 3' }));

    await waitFor(() => {
      expect(router.state.location.search).toEqual({});
    });
  });

  it('shows the upload empty state without the document search when no documents exist', async () => {
    const user = userEvent.setup();
    mocks.useCanMutateProject.mockReturnValue({ canMutateProject: true });
    mocks.useProjectFiles.mockReturnValue({
      files: [],
      isError: false,
      isLoading: false,
    });

    await renderWithRouter('/verfahren/project-1/');

    expect(screen.queryByText('toolbar')).toBeNull();
    expect(screen.queryByText('documents table')).toBeNull();

    await user.click(
      screen.getByRole('button', { name: 'Documents.uploadButton' }),
    );

    expect(mocks.openForProject).toHaveBeenCalledWith('project-1');
  });

  it('hides the update documents action for version one documents when document versioning is disabled', async () => {
    window.__APP_CONFIG__ = {
      VITE_ENABLE_DOCUMENT_VERSIONING_FEATURE: 'false',
    };
    mocks.useCanMutateProject.mockReturnValue({ canMutateProject: true });
    mocks.useProjectRouteVersion.mockReturnValue(1);

    await renderWithRouter('/verfahren/project-1/');

    expect(
      screen.queryByRole('button', {
        name: 'Documents.updateDocuments.buttonLabel',
      }),
    ).toBeNull();
  });

  it('shows the update documents action for version one documents when document versioning is enabled', async () => {
    window.__APP_CONFIG__ = {
      VITE_ENABLE_DOCUMENT_VERSIONING_FEATURE: 'true',
    };
    mocks.useCanMutateProject.mockReturnValue({ canMutateProject: true });
    mocks.useProjectRouteVersion.mockReturnValue(1);

    await renderWithRouter('/verfahren/project-1/');

    expect(
      screen.getByRole('button', {
        name: 'Documents.updateDocuments.buttonLabel',
      }),
    ).not.toBeNull();
  });
});
